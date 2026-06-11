"""Node-backed tests for the shared browser runtime and artifact modules."""

import json
import os
import subprocess
import sys

import pytest


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RUNTIME_JS = os.path.join(PROJECT_ROOT, "static", "js", "tools", "runtime.js")
ARTIFACTS_JS = os.path.join(PROJECT_ROOT, "static", "js", "tools", "artifacts.js")


def _node_available():
    try:
        subprocess.run(["node", "--version"], capture_output=True, timeout=5, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


def _run_js_module(module_body):
    """Run a JS snippet that imports project modules and returns JSON via stdout."""
    # Inject the project root as an import base so bare imports resolve.
    result = subprocess.run(
        ["node", "--input-type=module", "-e", module_body],
        capture_output=True,
        text=True,
        timeout=15,
        cwd=PROJECT_ROOT,
    )
    if result.returncode != 0:
        raise AssertionError(f"Node exited {result.returncode}: {result.stderr}")
    return json.loads(result.stdout.strip())


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_create_artifact_produces_typed_object():
    result = _run_js_module("""
        import { createArtifact } from './static/js/tools/artifacts.js';
        const a = createArtifact({ kind: 'text', name: 'out.json', mime: 'application/json', data: '{}' });
        process.stdout.write(JSON.stringify({ kind: a.kind, name: a.name, mime: a.mime, data: a.data }));
    """)
    assert result["kind"] == "text"
    assert result["name"] == "out.json"
    assert result["mime"] == "application/json"
    assert result["data"] == "{}"


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_save_artifact_routes_image_to_gallery():
    """saveArtifact should route image artifacts to /api/gallery/upload."""
    calls = []
    def fake_fetch(url, opts=None):
        calls.append({"url": url, "method": (opts or {}).get("method", "GET")})
        return type("Resp", (), {
            "ok": True,
            "json": lambda: {"id": "img-1", "url": "/gallery/img-1"},
            "blob": lambda: type("Blob", (), {})(),
            "status": 200,
        })()

    result = _run_js_module(f"""
        import {{ saveArtifact }} from './static/js/tools/artifacts.js';
        const calls = [];
        const fakeFetch = (url, opts) => {{
            calls.push({{ url, method: (opts || {{}}).method || 'GET' }});
            return Promise.resolve({{
                ok: true,
                json: () => Promise.resolve({{ id: 'img-1', url: '/gallery/img-1' }}),
                blob: () => Promise.resolve(new (typeof Blob !== 'undefined' ? Blob : class {{}})()),
                status: 200,
            }});
        }};
        const result = await saveArtifact(
            {{ kind: 'image', name: 'qr.png', mime: 'image/png', data: 'data:image/png;base64,abc' }},
            'run-1',
            {{ fetchImpl: fakeFetch }}
        );
        process.stdout.write(JSON.stringify({{ destination: result.destination, calls }}));
    """)
    assert result["destination"] == "gallery"
    urls = [c["url"] for c in result["calls"]]
    assert any("/api/gallery/upload" in u for u in urls)


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_execute_tool_records_run_lifecycle():
    """executeTool should create a run, execute the operation, and complete it."""
    result = _run_js_module("""
        import { executeTool, createArtifact } from './static/js/tools/runtime.js';
        const calls = [];
        const fakeFetch = (url, opts = {}) => {
            const method = opts.method || 'GET';
            calls.push({ url, method });
            if (method === 'POST' && url === '/api/tools/runs') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'run-abc' }) });
            }
            if (method === 'PATCH') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'completed' }) });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        };
        const opFn = async (input, settings, ctx) => {
            return createArtifact({ kind: 'text', name: 'result.txt', mime: 'text/plain', data: 'hello' });
        };
        const { run, artifact } = await executeTool({
            toolId: 'json-formatter',
            owner: 'alice',
            operationFn: opFn,
            input: '{}',
            settings: { indent: 2 },
            fetchImpl: fakeFetch,
        });
        process.stdout.write(JSON.stringify({ runId: run.id, artifactKind: artifact.kind, callCount: calls.length }));
    """)
    assert result["runId"] == "run-abc"
    assert result["artifactKind"] == "text"
    assert result["callCount"] == 2  # create run, complete run
