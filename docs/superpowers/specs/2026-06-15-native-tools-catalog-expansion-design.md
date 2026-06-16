# Native Tools Catalog Expansion Design

## Context

The Native Tools Platform Foundation is complete. It provides a manifest-driven registry, per-user run history, a shared browser runtime, typed artifacts, and explicit routing to Odysseus Library/Gallery stores. The foundation shipped with five representative offline tools: JSON Formatter, QR Generator, Image Resizer, Structured PII Redactor, and PDF Toolkit.

The repository already contains manifests, operation modules, and view modules for all 30 offline tools documented in `README.md`. However, only the five foundation tools have focused operation tests, and several of the remaining operation modules have known simplifications that may fail on real edge cases.

## Goal

Complete the catalog expansion by verifying, hardening, and adding focused test coverage for the 25 tools that currently exist but are not exercised by tests. Every tool must either pass its operation tests or carry an explicit documented skip when browser APIs make Node testing impossible.

## Scope

In scope:
- Add focused operation tests for the 25 untested tools.
- Fix operation bugs surfaced by tests.
- Update `context/progress-tracker.md` to reflect catalog expansion status.
- Keep all changes within the existing platform contracts (manifests, runtime, artifacts, views).

Out of scope:
- No new backend infrastructure.
- No new agent bridge or workflow features.
- No new UI shell or hub behavior beyond what is needed to fix a tested bug.
- No AI/adaptive features.

## Tool Batches

Tools are grouped by contract shape to keep review focused and to reuse test patterns within a batch.

### Batch A: Data and Conversion (6 tools)
- `json-csv`: JSON ↔ CSV conversion.
- `yaml-json`: YAML ↔ JSON conversion.
- `number-base-converter`: integer conversion between bases 2–36.
- `unit-converter`: length, mass, temperature, area, volume, speed.
- `unix-timestamp`: epoch ↔ human-readable datetime.
- `color-converter`: hex, rgb, hsl conversion.

### Batch B: Text and Developer (10 tools)
- `text-case`: case conversions (upper, lower, title, snake, kebab, camel).
- `text-counter`: characters, words, lines, sentences, paragraphs.
- `text-diff`: line diff between two texts.
- `text-sorter`: sort lines alphabetically/numerically.
- `regex-tester`: match regex with flags and groups.
- `html-formatter`: pretty-print/minify HTML.
- `css-minifier`: minify CSS.
- `markdown-html`: render Markdown preview to HTML.
- `cron-parser`: cron expression description and next-run estimate.
- `http-status`: HTTP status code lookup.

### Batch C: Encoding and Security (5 tools)
- `base64`: encode/decode text and binary-compatible strings.
- `url-encoder`: encode/decode URL components.
- `hash-generator`: MD5, SHA-1, SHA-256, SHA-512 via SubtleCrypto.
- `jwt-decoder`: decode header/payload without verification.
- `password-generator`: configurable character-set passwords.

### Batch D: Generation and Media (4 tools)
- `uuid-generator`: random UUID v4 bulk generation.
- `lorem-ipsum`: placeholder text generation.
- `fake-data`: CSV rows of fake people data.
- `svg-png`: SVG rasterization to PNG (browser-only, Node skip).

## Test Strategy

Tests live in `tests/js/test_tools_operations_js.py` and use Node subprocesses to import ES modules directly, the same pattern established by the foundation tests. Each tool gets at least one test covering:
1. The happy-path operation returns a typed artifact.
2. Output data shape matches expectations.
3. At least one edge case (empty input, invalid input, round-trip, or error).

Tests must set `globalThis.document = { createElement: () => ({}) }` because operation modules import `createArtifact` from `artifacts.js`, which creates a `<a>` element for downloads.

Browser-only operations that require Canvas, Image, SVG DOM, or `Blob` rendering in a real document are skipped with a reason and linked to manual browser smoke verification.

## Quality Rules

- Write the failing test before fixing implementation.
- Do not break existing invariants in `context/architecture.md`.
- Never store raw tool inputs in history, logs, memory, or RAG.
- Preserve owner scoping and existing privilege checks.
- Keep browser-local processing local.
- Fix only what tests reveal; avoid unrelated refactoring of view modules.

## Completion Gate

The catalog expansion is complete when:
1. Every in-scope tool either passes operation tests or has an explicit skip with reason.
2. Focused tool tests and neighboring regressions pass.
3. `python3 -m py_compile` on changed Python files exits `0`.
4. `git diff --check` reports no whitespace errors.
5. `context/progress-tracker.md` accurately reflects completion.

After this gate, the next phase is agent discovery and typed workflows, per the original design spec.
