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

# ──────────────────────────────────────────────────────────────────────────────
# Batch A: Data and Conversion
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_json_csv_round_trip():
    result = _run_js_module("""
        import { jsonToCsv, csvToJson } from './static/js/tools/operations/json-csv.js';
        globalThis.document = { createElement: () => ({}) };
        var csv = await jsonToCsv('[{"a":1,"b":2}]');
        var json = await csvToJson(csv.data);
        process.stdout.write(JSON.stringify({csv: csv.data, json: json.data, csvMime: csv.mime, jsonMime: json.mime}));
    """)
    assert result["csvMime"] == "text/csv"
    assert result["jsonMime"] == "application/json"
    assert result["csv"].strip().startswith("a,b")
    parsed = json.loads(result["json"])
    assert parsed[0]["a"] == "1"


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_yaml_json_nested():
    result = _run_js_module("""
        import { yamlToJson, jsonToYaml } from './static/js/tools/operations/yaml-json.js';
        globalThis.document = { createElement: () => ({}) };
        var y = 'person:\\n  name: Ada\\n  age: 36';
        var j = await yamlToJson(y);
        var y2 = await jsonToYaml(j.data);
        process.stdout.write(JSON.stringify({json: j.data, yaml: y2.data}));
    """)
    parsed = json.loads(result["json"])
    assert parsed["person"]["name"] == "Ada"
    assert parsed["person"]["age"] == 36 or parsed["person"]["age"] == "36"
    assert "Ada" in result["yaml"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_number_base_conversion():
    result = _run_js_module("""
        import { convert } from './static/js/tools/operations/number-base-converter.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await convert('255', { from: 10, to: 16 });
        var b = await convert('ff', { from: 16, to: 2 });
        process.stdout.write(JSON.stringify({a: a.data, b: b.data}));
    """)
    assert "ff" in result["a"].lower()
    assert "11111111" in result["b"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_unit_converter_temperature_and_length():
    result = _run_js_module("""
        import { convert } from './static/js/tools/operations/unit-converter.js';
        globalThis.document = { createElement: () => ({}) };
        var c2f = await convert('0', { category: 'temperature', from: 'C', to: 'F' });
        var m2ft = await convert('1', { category: 'length', from: 'm', to: 'ft' });
        process.stdout.write(JSON.stringify({c2f: c2f.data, m2ft: m2ft.data}));
    """)
    assert "32" in result["c2f"]
    assert "3.280" in result["m2ft"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_unix_timestamp_conversion():
    result = _run_js_module("""
        import { toDate, toTimestamp } from './static/js/tools/operations/unix-timestamp.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await toDate('0');
        var b = await toTimestamp('1970-01-01T00:00:00.000Z');
        process.stdout.write(JSON.stringify({human: a.data, epoch: b.data}));
    """)
    assert "1970" in result["human"]
    assert result["epoch"].strip() == "0"


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_color_converter_hex_rgb_round_trip():
    result = _run_js_module("""
        import { convert } from './static/js/tools/operations/color-converter.js';
        globalThis.document = { createElement: () => ({}) };
        var rgb = await convert('#ff5733');
        var hex = await convert('rgb(255, 87, 51)');
        process.stdout.write(JSON.stringify({rgb: rgb.data, hex: hex.data}));
    """)
    assert "255" in result["rgb"]
    assert "87" in result["rgb"]
    assert "ff5733" in result["hex"].lower()


# ──────────────────────────────────────────────────────────────────────────────
# Batch B: Text and Developer Tools
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_text_case_converter():
    result = _run_js_module("""
        import { convert } from './static/js/tools/operations/text-case.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await convert('hello world', { mode: 'upper' });
        var b = await convert('Hello World', { mode: 'snake' });
        var c = await convert('hello_world', { mode: 'camel' });
        process.stdout.write(JSON.stringify({a: a.data, b: b.data, c: c.data}));
    """)
    assert result["a"] == "HELLO WORLD"
    assert result["b"] == "hello_world"
    assert result["c"] == "helloWorld"


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_text_counter():
    result = _run_js_module("""
        import { count } from './static/js/tools/operations/text-counter.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await count('Hello world.\\n\\nAnother line.', {});
        process.stdout.write(JSON.stringify({data: a.data}));
    """)
    assert "Characters: 27" in result["data"]
    assert "Words: 4" in result["data"]
    assert "Paragraphs: 2" in result["data"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_text_diff():
    result = _run_js_module("""
        import { diff } from './static/js/tools/operations/text-diff.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await diff('', { left: 'apple\\nbanana', right: 'apple\\nblueberry' });
        process.stdout.write(JSON.stringify({data: a.data}));
    """)
    assert "- banana" in result["data"]
    assert "+ blueberry" in result["data"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_text_sorter():
    result = _run_js_module("""
        import { sort } from './static/js/tools/operations/text-sorter.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await sort('banana\\napple\\ncherry', { method: 'alphabetical', direction: 'asc' });
        process.stdout.write(JSON.stringify({data: a.data}));
    """)
    lines = result["data"].split('\n')
    assert lines == ['apple', 'banana', 'cherry']


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_regex_tester():
    result = _run_js_module("""
        import { test } from './static/js/tools/operations/regex-tester.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await test('foo 123 bar 456', { pattern: '\\\\d+', flags: 'g' });
        process.stdout.write(JSON.stringify({data: a.data, count: a.meta.matchCount}));
    """)
    assert result["count"] == 2
    assert '123' in result["data"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_html_formatter():
    result = _run_js_module("""
        import { prettyPrint, minify } from './static/js/tools/operations/html-formatter.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await prettyPrint('<div><span>a</span></div>', { indent: 2 });
        var b = await minify('<div>  <span>a</span>  </div>', {});
        process.stdout.write(JSON.stringify({pretty: a.data, minified: b.data}));
    """)
    assert "<div>" in result["pretty"]
    assert "<span>" in result["pretty"]
    assert result["minified"].replace(' ', '') == '<div><span>a</span></div>'


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_css_minifier():
    result = _run_js_module("""
        import { minify } from './static/js/tools/operations/css-minifier.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await minify('body { color: red; /* comment */ margin: 0; }', {});
        process.stdout.write(JSON.stringify({data: a.data}));
    """)
    assert "comment" not in result["data"]
    assert "body{" in result["data"].replace(' ', '')


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_markdown_html():
    result = _run_js_module("""
        import { convert } from './static/js/tools/operations/markdown-html.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await convert('# Title\\n\\nSome **bold** text.', {});
        process.stdout.write(JSON.stringify({data: a.data}));
    """)
    assert "<h1>" in result["data"]
    assert "<strong>" in result["data"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_cron_parser():
    result = _run_js_module("""
        import { parse } from './static/js/tools/operations/cron-parser.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await parse('0 9 * * 1', {});
        process.stdout.write(JSON.stringify({data: a.data}));
    """)
    assert "minute: 0" in result["data"]
    assert "hour: 9" in result["data"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_http_status_lookup():
    result = _run_js_module("""
        import { lookup } from './static/js/tools/operations/http-status.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await lookup('404', {});
        var b = await lookup('teapot', {});
        process.stdout.write(JSON.stringify({a: a.data, b: b.data}));
    """)
    assert "Not Found" in result["a"]
    assert "teapot" in result["b"].lower()


# ──────────────────────────────────────────────────────────────────────────────
# Batch C: Encoding and Security
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_base64_round_trip():
    result = _run_js_module("""
        import { encode, decode } from './static/js/tools/operations/base64.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await encode('hello world!');
        var b = await decode(a.data);
        process.stdout.write(JSON.stringify({enc: a.data, dec: b.data}));
    """)
    assert result["enc"] == "aGVsbG8gd29ybGQh"
    assert result["dec"] == "hello world!"


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_url_encoder_round_trip():
    result = _run_js_module("""
        import { encode, decode } from './static/js/tools/operations/url-encoder.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await encode('hello world?');
        var b = await decode(a.data);
        process.stdout.write(JSON.stringify({enc: a.data, dec: b.data}));
    """)
    assert "hello%20world" in result["enc"]
    assert result["dec"] == "hello world?"


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_hash_generator():
    result = _run_js_module("""
        import { hash } from './static/js/tools/operations/hash-generator.js';
        globalThis.document = { createElement: () => ({}) };
        try {
            var a = await hash('abc', { algorithm: 'SHA-256' });
            process.stdout.write(JSON.stringify({ok: true, data: a.data, len: a.data.length}));
        } catch (e) {
            process.stdout.write(JSON.stringify({ok: false, error: e.message}));
        }
    """)
    if result.get("ok"):
        assert result["len"] == 64
    else:
        pytest.skip(result.get("error", "Web Crypto unavailable"))


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_jwt_decoder():
    result = _run_js_module("""
        import { decode } from './static/js/tools/operations/jwt-decoder.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await decode('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', {});
        process.stdout.write(JSON.stringify({data: a.data}));
    """)
    assert "John Doe" in result["data"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_password_generator():
    result = _run_js_module("""
        import { generate } from './static/js/tools/operations/password-generator.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await generate('', { length: 16, upper: true, lower: true, digits: true, symbols: false });
        process.stdout.write(JSON.stringify({len: a.data.length, data: a.data}));
    """)
    assert result["len"] == 16
    assert result["data"].isalnum()


# ──────────────────────────────────────────────────────────────────────────────
# Batch D: Generation and Media
# ──────────────────────────────────────────────────────────────────────────────

@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_uuid_generator():
    result = _run_js_module("""
        import { generate } from './static/js/tools/operations/uuid-generator.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await generate('', { count: 3 });
        var count = a.data.split('\\n').length;
        process.stdout.write(JSON.stringify({count: count, data: a.data}));
    """)
    assert result["count"] == 3
    for line in result["data"].split('\n'):
        assert len(line.split('-')) == 5


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_lorem_ipsum():
    result = _run_js_module("""
        import { generate } from './static/js/tools/operations/lorem-ipsum.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await generate('', { count: 2, mode: 'paragraphs' });
        process.stdout.write(JSON.stringify({data: a.data}));
    """)
    assert "lorem" in result["data"].lower()
    assert result["data"].count('\n') >= 1


@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_fake_data_csv():
    result = _run_js_module("""
        import { generate } from './static/js/tools/operations/fake-data.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await generate('', { count: 5 });
        var lines = a.data.split('\\n').length;
        process.stdout.write(JSON.stringify({lines: lines, data: a.data}));
    """)
    assert result["lines"] == 6  # header + 5 rows
    assert "firstName" in result["data"]


@pytest.mark.skipif(not _node_available(), reason="Node not available")
@pytest.mark.skip(reason="SVG rasterization requires browser Canvas/Image")
def test_svg_png_operation():
    """Browser-only: operation requires Image and canvas elements."""
    pass
