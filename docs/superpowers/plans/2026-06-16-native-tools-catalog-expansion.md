# Native Tools Catalog Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add focused operation tests for the 25 untested Native Tools, fix bugs surfaced by tests, and complete the offline 30-tool catalog.

**Architecture:** Extend the existing Node subprocess test pattern in `tests/js/test_tools_operations_js.py`. Each batch tests pure ES modules from `static/js/tools/operations/*.js` directly, setting a minimal `document` shim. Tests assert artifact shape, happy-path output, and edge cases. We fix only operation bugs the tests reveal; UI view modules and platform plumbing remain unchanged unless required.

**Tech Stack:** Python/pytest, Node.js subprocess, vanilla ES modules, existing artifact/runtime contracts.

---

## File Structure

- `tests/js/test_tools_operations_js.py` — extended with one or more tests per untested tool.
- `static/js/tools/operations/*.js` — operation modules under test; fixes applied in place.
- `static/js/tools/views/*.js` — unchanged unless an operation fix requires a matching contract tweak.
- `context/progress-tracker.md` — updated after final verification.

## Test Harness Conventions

Every test uses the same helper already in the file:

```python
import subprocess, json, os, pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def _node_available():
    try:
        subprocess.run(["node", "--version"], capture_output=True, timeout=5, check=True)
        return True
    except Exception:
        return False

def _run_js_module(module_body):
    result = subprocess.run(
        ["node", "--input-type=module", "-e", module_body],
        capture_output=True, text=True, timeout=15, cwd=PROJECT_ROOT,
    )
    if result.returncode != 0:
        raise AssertionError(f"Node exited {result.returncode}: {result.stderr}")
    return json.loads(result.stdout.strip())
```

Operation tests set the document shim because `artifacts.js` creates an `a` element:

```js
globalThis.document = { createElement: () => ({}) };
```

Browser-only tests use `@pytest.mark.skip(reason="...")`.

---

## Task 1: Batch A — Data and Conversion

**Files:**
- Modify: `tests/js/test_tools_operations_js.py`
- Modify: `static/js/tools/operations/json-csv.js`
- Modify: `static/js/tools/operations/yaml-json.js`
- Modify: `static/js/tools/operations/number-base-converter.js`
- Modify: `static/js/tools/operations/unit-converter.js`
- Modify: `static/js/tools/operations/unix-timestamp.js`
- Modify: `static/js/tools/operations/color-converter.js`

### 1.1 JSON ↔ CSV Converter

- [ ] **Step 1: Write failing test**

```python
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
    assert parsed[0]["a"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_json_csv_round_trip -v
```

Expected: `FAILED` with function/import not defined.

- [ ] **Step 3: Implement minimal operation functions**

Ensure `json-csv.js` exports:
- `jsonToCsv(input, settings)` — parses JSON array of objects, returns CSV text artifact.
- `csvToJson(input, settings)` — parses CSV text, returns JSON artifact.

Handle header parsing, commas inside quoted values, and empty input errors. Use `createArtifact` with correct `mime` values.

- [ ] **Step 4: Run test to verify it passes**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_json_csv_round_trip -v
```

Expected: PASS.

### 1.2 YAML ↔ JSON Converter

- [ ] **Step 1: Write failing test**

```python
@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_yaml_json_nested():
    result = _run_js_module("""
        import { yamlToJson, jsonToYaml } from './static/js/tools/operations/yaml-json.js';
        globalThis.document = { createElement: () => ({}) };
        var y = 'person:\n  name: Ada\n  age: 36';
        var j = await yamlToJson(y);
        var y2 = await jsonToYaml(j.data);
        process.stdout.write(JSON.stringify({json: j.data, yaml: y2.data}));
    """)
    parsed = json.loads(result["json"])
    assert parsed["person"]["name"] == "Ada"
    assert parsed["person"]["age"] == 36 or parsed["person"]["age"] == "36"
    assert "Ada" in result["yaml"]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_yaml_json_nested -v
```

Expected: FAILED (parser too naive).

- [ ] **Step 3: Harden YAML parser/serializer**

Fix `yaml-json.js` to parse at least two-level nested objects and arrays correctly. Preserve scalar types where possible. Keep implementation dependency-free.

- [ ] **Step 4: Run test to verify it passes**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_yaml_json_nested -v
```

Expected: PASS.

### 1.3 Number Base Converter

- [ ] **Step 1: Write failing test**

```python
@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_number_base_conversion():
    result = _run_js_module("""
        import { convert } from './static/js/tools/operations/number-base-converter.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await convert('255', { fromBase: 10, toBase: 16 });
        var b = await convert('ff', { fromBase: 16, toBase: 2 });
        process.stdout.write(JSON.stringify({a: a.data, b: b.data}));
    """)
    assert "FF" in result["a"].upper() or "ff" in result["a"]
    assert "11111111" in result["b"]
```

- [ ] **Step 2: Verify failure**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_number_base_conversion -v
```

Expected: FAILED.

- [ ] **Step 3: Implement conversion logic**

Ensure `convert(input, { fromBase, toBase })` parses an integer from the source base, converts, and returns a text artifact. Validate base range 2–36.

- [ ] **Step 4: Verify pass**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_number_base_conversion -v
```

Expected: PASS.

### 1.4 Unit Converter

- [ ] **Step 1: Write failing test**

```python
@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_unit_converter_temperature_and_length():
    result = _run_js_module("""
        import { convert } from './static/js/tools/operations/unit-converter.js';
        globalThis.document = { createElement: () => ({}) };
        var c2f = await convert('0', { category: 'temperature', from: 'C', to: 'F' });
        var m2ft = await convert('1', { category: 'length', from: 'm', to: 'ft' });
        process.stdout.write(JSON.stringify({c2f: c2f.data, m2ft: m2ft.data}));
    """)
    assert "32.00" in result["c2f"] or "32" in result["c2f"]
    assert "3.280" in result["m2ft"]
```

- [ ] **Step 2: Verify failure**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_unit_converter_temperature_and_length -v
```

Expected: FAILED.

- [ ] **Step 3: Fix unit conversion**

Ensure `convert` handles all declared categories and units. Use correct conversion formulas, especially for temperature.

- [ ] **Step 4: Verify pass**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_unit_converter_temperature_and_length -v
```

Expected: PASS.

### 1.5 Unix Timestamp Converter

- [ ] **Step 1: Write failing test**

```python
@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_unix_timestamp_conversion():
    result = _run_js_module("""
        import { epochToHuman, humanToEpoch } from './static/js/tools/operations/unix-timestamp.js';
        globalThis.document = { createElement: () => ({}) };
        var a = await epochToHuman('0', { timezone: 'UTC' });
        var b = await humanToEpoch('1970-01-01T00:00:00Z', { timezone: 'UTC' });
        process.stdout.write(JSON.stringify({human: a.data, epoch: b.data}));
    """)
    assert "1970" in result["human"]
    assert result["epoch"].strip() == "0" or result["epoch"].strip() == "0000000000"
```

- [ ] **Step 2: Verify failure**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_unix_timestamp_conversion -v
```

Expected: FAILED.

- [ ] **Step 3: Implement timestamp conversion**

Export `epochToHuman` and `humanToEpoch` returning text artifacts. Use `Date` and ISO formatting. Support `timezone: 'UTC'` and local default.

- [ ] **Step 4: Verify pass**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_unix_timestamp_conversion -v
```

Expected: PASS.

### 1.6 Color Converter

- [ ] **Step 1: Write failing test**

```python
@pytest.mark.skipif(not _node_available(), reason="Node not available")
def test_color_converter_hex_rgb_round_trip():
    result = _run_js_module("""
        import { hexToRgb, rgbToHex } from './static/js/tools/operations/color-converter.js';
        globalThis.document = { createElement: () => ({}) };
        var rgb = await hexToRgb('#ff5733');
        var hex = await rgbToHex('255, 87, 51');
        process.stdout.write(JSON.stringify({rgb: rgb.data, hex: hex.data}));
    """)
    assert "255" in result["rgb"]
    assert "87" in result["rgb"]
    assert "ff5733" in result["hex"].lower()
```

- [ ] **Step 2: Verify failure**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_color_converter_hex_rgb_round_trip -v
```

Expected: FAILED.

- [ ] **Step 3: Implement color conversion functions**

Ensure exports include at least `hexToRgb`, `rgbToHex`, and `hslToRgb`. Use simple parsing and formatting.

- [ ] **Step 4: Verify pass**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py::test_color_converter_hex_rgb_round_trip -v
```

Expected: PASS.

### 1.7 Commit Batch A

```bash
git add tests/js/test_tools_operations_js.py static/js/tools/operations/json-csv.js static/js/tools/operations/yaml-json.js static/js/tools/operations/number-base-converter.js static/js/tools/operations/unit-converter.js static/js/tools/operations/unix-timestamp.js static/js/tools/operations/color-converter.js
git commit -m "feat: verify and test Batch A data and conversion tools"
```

---

## Task 2: Batch B — Text and Developer Tools

**Files:**
- Modify: `tests/js/test_tools_operations_js.py`
- Modify: `static/js/tools/operations/text-case.js`
- Modify: `static/js/tools/operations/text-counter.js`
- Modify: `static/js/tools/operations/text-diff.js`
- Modify: `static/js/tools/operations/text-sorter.js`
- Modify: `static/js/tools/operations/regex-tester.js`
- Modify: `static/js/tools/operations/html-formatter.js`
- Modify: `static/js/tools/operations/css-minifier.js`
- Modify: `static/js/tools/operations/markdown-html.js`
- Modify: `static/js/tools/operations/cron-parser.js`
- Modify: `static/js/tools/operations/http-status.js`

For each tool:
- [ ] Write failing test asserting the operation returns the correct artifact and output.
- [ ] Run test; expect failure.
- [ ] Fix operation if needed.
- [ ] Re-run test; expect pass.

### 2.1 Text Case Converter

Test: `test_text_case_converter`
- Verify `upperCase`, `lowerCase`, `titleCase`, `snakeCase`, `kebabCase`, `camelCase` produce correct output for mixed input.

### 2.2 Text Counter

Test: `test_text_counter`
- Verify character, word, line, sentence, and paragraph counts for a multi-line sample.

### 2.3 Text Diff

Test: `test_text_diff`
- Verify diff identifies added/removed lines between two texts.

### 2.4 Text Sorter

Test: `test_text_sorter`
- Verify alphabetical and numeric sorting, ascending/descending, duplicate handling.

### 2.5 Regex Tester

Test: `test_regex_tester`
- Verify matches and group capture with flags.

### 2.6 HTML Formatter

Test: `test_html_formatter`
- Verify pretty-print and minify output for simple HTML.

### 2.7 CSS Minifier

Test: `test_css_minifier`
- Verify whitespace/comments removed without altering rules.

### 2.8 Markdown Preview

Test: `test_markdown_html`
- Verify headings and paragraphs converted to HTML.

### 2.9 Cron Parser

Test: `test_cron_parser`
- Verify description and next-run metadata for a simple cron expression.

### 2.10 HTTP Status Codes

Test: `test_http_status_lookup`
- Verify lookup of known codes returns title/description.

### 2.11 Commit Batch B

```bash
git add tests/js/test_tools_operations_js.py static/js/tools/operations/text-case.js static/js/tools/operations/text-counter.js static/js/tools/operations/text-diff.js static/js/tools/operations/text-sorter.js static/js/tools/operations/regex-tester.js static/js/tools/operations/html-formatter.js static/js/tools/operations/css-minifier.js static/js/tools/operations/markdown-html.js static/js/tools/operations/cron-parser.js static/js/tools/operations/http-status.js
git commit -m "feat: verify and test Batch B text and developer tools"
```

---

## Task 3: Batch C — Encoding and Security

**Files:**
- Modify: `tests/js/test_tools_operations_js.py`
- Modify: `static/js/tools/operations/base64.js`
- Modify: `static/js/tools/operations/url-encoder.js`
- Modify: `static/js/tools/operations/hash-generator.js`
- Modify: `static/js/tools/operations/jwt-decoder.js`
- Modify: `static/js/tools/operations/password-generator.js`

### 3.1 Base64

Test: `test_base64_round_trip`
- Verify encode + decode returns original text.

### 3.2 URL Encoder

Test: `test_url_encoder_round_trip`
- Verify `encodeURIComponent`-style encode/decode.

### 3.3 Hash Generator

Test: `test_hash_generator`
- Skip if SubtleCrypto unavailable in Node; otherwise verify SHA-256 hash of known string.

### 3.4 JWT Decoder

Test: `test_jwt_decoder`
- Verify decoding header/payload of a known JWT.

### 3.5 Password Generator

Test: `test_password_generator`
- Verify generated password length and character set constraints.

### 3.6 Commit Batch C

```bash
git add tests/js/test_tools_operations_js.py static/js/tools/operations/base64.js static/js/tools/operations/url-encoder.js static/js/tools/operations/hash-generator.js static/js/tools/operations/jwt-decoder.js static/js/tools/operations/password-generator.js
git commit -m "feat: verify and test Batch C encoding and security tools"
```

---

## Task 4: Batch D — Generation and Media

**Files:**
- Modify: `tests/js/test_tools_operations_js.py`
- Modify: `static/js/tools/operations/uuid-generator.js`
- Modify: `static/js/tools/operations/lorem-ipsum.js`
- Modify: `static/js/tools/operations/fake-data.js`
- Modify: `static/js/tools/operations/svg-png.js`

### 4.1 UUID Generator

Test: `test_uuid_generator`
- Verify requested count of UUIDs, each matching v4 shape.

### 4.2 Lorem Ipsum

Test: `test_lorem_ipsum`
- Verify word/paragraph count and output contains placeholder text.

### 4.3 Fake Data Generator

Test: `test_fake_data_csv`
- Verify CSV output with header and requested row count.

### 4.4 SVG to PNG

Test: `test_svg_png_browser_only`
- Mark skipped: browser-only due to Canvas/Image rasterization.

### 4.5 Commit Batch D

```bash
git add tests/js/test_tools_operations_js.py static/js/tools/operations/uuid-generator.js static/js/tools/operations/lorem-ipsum.js static/js/tools/operations/fake-data.js static/js/tools/operations/svg-png.js
git commit -m "feat: verify and test Batch D generation and media tools"
```

---

## Task 5: Verification and Completion

**Files:**
- Modify: `context/progress-tracker.md`

- [ ] **Step 1: Run focused tool tests**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/js/test_tools_operations_js.py -v
```

Expected: all pass or explicitly skipped.

- [ ] **Step 2: Run neighboring regressions**

```bash
/Users/benblum/Desktop/repo/odysseus/.venv/bin/python -m pytest tests/unit/test_tools_manifest.py tests/unit/test_tools_history.py tests/routes/test_tools_routes.py tests/js/test_tools_runtime_js.py tests/js/test_tools_hub_js.py tests/test_prefs_routes.py tests/test_prefs_atomic_write.py tests/test_gallery_owner_filter_single_user.py tests/test_gallery_null_user_routes.py tests/test_document_session_owner_scope.py -v
```

Expected: all pass.

- [ ] **Step 3: Static checks**

```bash
python3 -m py_compile src/tools_platform/*.py routes/tools_routes.py core/database.py app.py
git diff --check
```

Expected: `0` exit and no output.

- [ ] **Step 4: Update progress tracker**

Revise `context/progress-tracker.md`:
- Mark catalog expansion complete.
- Update test count summary (30+ operation tests).
- Move later releases to next phase.

```bash
git add context/progress-tracker.md
git commit -m "docs: update progress tracker for catalog expansion"
```

---

## Self-Review Checklist

1. **Spec coverage:** Each of the 25 untested tools maps to tests and optional fixes in Tasks 1–4. Completion gate in Task 5 maps to spec completion criteria.
2. **No placeholders:** Every task has concrete test code, expected output, and commit commands.
3. **Type consistency:** `createArtifact` contract and Node test helpers are reused unchanged.
4. **No new infrastructure:** Only `tests/js/test_tools_operations_js.py` and operation modules are modified.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-16-native-tools-catalog-expansion.md`.

**Execution options:**
1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per batch/task, with two-stage review.
2. **Inline Execution** — execute tasks in this session using executing-plans.
