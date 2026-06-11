"""Node-backed tests for the five tool operation modules."""

import json
import os
import subprocess
import sys

import pytest


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _node_available():
    try:
        subprocess.run(["node", "--version"], capture_output=True, timeout=5, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


def _run_js_module(module_body):
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
def test_json_pretty_print():
    result = _run_js_module("""
        import { prettyPrint } from './static/js/tools/operations/json-formatter.js';
        globalThis.document = { createElement: function() { return {}; } };
        var a = await prettyPrint('{"a":1}', { indent: 2 });
        process.stdout.write(JSON.stringify({ kind: a.kind, data: a.data }));
    """)
    assert result["kind"] == "text"
    parsed = json.loads(result["data"])
    assert parsed["a"] == 1


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_json_validate():
    result = _run_js_module("""
        import { validate } from './static/js/tools/operations/json-formatter.js';
        globalThis.document = { createElement: function() { return {}; } };
        var a = await validate('{"a":1}');
        var b = await validate('not json');
        process.stdout.write(JSON.stringify({ valid: a.meta.valid, invalid: !b.meta.valid }));
    """)
    assert result["valid"]
    assert result["invalid"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_pii_redact_emails():
    result = _run_js_module("""
        import { redact } from './static/js/tools/operations/pii-redactor.js';
        globalThis.document = { createElement: function() { return {}; } };
        var a = await redact('Contact alice@example.com or bob@test.org', { types: ['email'] });
        process.stdout.write(JSON.stringify({ data: a.data, found: a.meta.found }));
    """)
    assert "[EMAIL]" in result["data"]
    assert "alice@example.com" not in result["data"]
    assert result["found"]["email"] == 2


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_pii_redact_ssn():
    result = _run_js_module("""
        import { redact } from './static/js/tools/operations/pii-redactor.js';
        globalThis.document = { createElement: function() { return {}; } };
        var a = await redact('SSN: 123-45-6789', { types: ['ssn'] });
        process.stdout.write(JSON.stringify({ data: a.data }));
    """)
    assert "[SSN]" in result["data"]
    assert "123-45-6789" not in result["data"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_pii_redact_credit_card():
    result = _run_js_module("""
        import { redact } from './static/js/tools/operations/pii-redactor.js';
        globalThis.document = { createElement: function() { return {}; } };
        var a = await redact('Card: 4111-1111-1111-1111', { types: ['credit-card'] });
        process.stdout.write(JSON.stringify({ data: a.data }));
    """)
    assert "[CREDIT_CARD]" in result["data"]
    assert "4111" not in result["data"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
@pytest.mark.skip(reason="Image and Canvas require browser environment")
def test_image_resize_operation():
    """Test resize operation with a minimal 1x1 pixel PNG."""
    result = _run_js_module("""
        import { resize } from './static/js/tools/operations/image-resizer.js';
        var pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        var byteChars = atob(pngBase64);
        var bytes = new Uint8Array(byteChars.length);
        for (var i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        var blob = new Blob([bytes], { type: 'image/png' });
        var a = await resize(blob, { width: 10, height: 10 });
        process.stdout.write(JSON.stringify({ kind: a.kind, name: a.name, width: a.meta.width }));
    """)
    assert result["kind"] == "image"
    assert result["name"] == "resized.png"
    assert result["width"] == 10
