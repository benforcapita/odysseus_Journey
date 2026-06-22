"""Command palette merges a dynamic command provider into filter results.

Covers the setDynamicCommands hook added so keyboard-shortcuts.js can
inject per-window actions at palette-open / keystroke time.
"""

import json
import shutil
import subprocess
import textwrap
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parent.parent
_PAL = _REPO / "static" / "js" / "commandPalette.js"
_HAS_NODE = shutil.which("node") is not None


def _run_palette_case():
    script = textwrap.dedent(f"""
        globalThis.__els = {{}};
        const makeEl = (id) => ({{
          id, tagName: 'div', className: '',
          innerHTML: '', value: '', style: {{}}, dataset: {{}},
          classList: {{ _s: new Set(),
            add(...n) {{ n.forEach(x => this._s.add(x)); }},
            remove(...n) {{ n.forEach(x => this._s.delete(x)); }},
            contains(n) {{ return this._s.has(n); }},
            toggle(n) {{ this._s.has(n) ? this._s.delete(n) : this._s.add(n); }} }},
          _ls: {{}},
          focus() {{}}, scrollIntoView() {{}},
          addEventListener(t, cb) {{ (this._ls[t] = this._ls[t] || []).push(cb); }},
          removeEventListener(t) {{ this._ls[t] = []; }},
          dispatchEvent(ev) {{ (this._ls[ev.type] || []).forEach(cb => cb(ev)); return true; }},
          querySelector() {{ return null; }},
          querySelectorAll() {{ return []; }},
        }});
        // Pre-create the overlay + input + results so the palette's
        // _ensureOverlay early-returns and getElementById finds our stubs.
        globalThis.__els['cmd-palette-overlay'] = makeEl('cmd-palette-overlay');
        globalThis.__els['cmd-palette-input']   = makeEl('cmd-palette-input');
        globalThis.__els['cmd-palette-results'] = makeEl('cmd-palette-results');
        globalThis.document = {{
          readyState: 'complete',
          body: {{ appendChild() {{}} }},
          documentElement: {{ style: {{}} }},
          getElementById(id) {{ return globalThis.__els[id]; }},
          createElement(tag) {{ return makeEl(tag); }},
          addEventListener() {{}}, querySelector() {{ return null; }},
          querySelectorAll() {{ return []; }},
        }};
        globalThis.window = {{
          innerWidth: 1200, innerHeight: 800,
          addEventListener() {{}}, removeEventListener() {{}},
        }};
        globalThis.getComputedStyle = () => ({{}});
        globalThis.setTimeout = () => 0;
        globalThis.Event = class {{ constructor(t) {{ this.type = t; }} }};

        const mod = await import('{_PAL.as_posix()}');

        mod.setDynamicCommands(() => [
          {{ id: 'win:close:calendar-modal', label: 'Close Calendar', category: 'Window' }},
        ]);
        mod.init();
        mod.open(() => {{}});

        const inp = globalThis.__els['cmd-palette-input'];
        inp.value = 'close cal';
        inp.dispatchEvent(new Event('input'));
        const rows = globalThis.__els['cmd-palette-results'].innerHTML;
        console.log(JSON.stringify({{
          hasCalendarClose: rows.includes('Close Calendar'),
          hasWindowCategory: rows.includes('Window'),
        }}));

        mod.close();
        mod.setDynamicCommands(null);
        mod.open(() => {{}});
        const inp2 = globalThis.__els['cmd-palette-input'];
        inp2.value = 'close cal';
        inp2.dispatchEvent(new Event('input'));
        const rows2 = globalThis.__els['cmd-palette-results'].innerHTML;
        console.log(JSON.stringify({{
          calendarGoneAfterClear: !rows2.includes('Close Calendar'),
        }}));
    """)
    proc = subprocess.run(
        ["node", "--input-type=module"],
        input=script,
        capture_output=True,
        text=True,
        cwd=str(_REPO),
        timeout=30,
    )
    assert proc.returncode == 0, proc.stderr
    lines = [ln for ln in proc.stdout.strip().splitlines() if ln.strip().startswith("{")]
    return [json.loads(ln) for ln in lines]


@pytest.mark.skipif(not _HAS_NODE, reason="node binary not on PATH")
def test_dynamic_commands_are_merged_into_palette_results():
    open_result, cleared_result = _run_palette_case()
    assert open_result["hasCalendarClose"] is True
    assert open_result["hasWindowCategory"] is True
    assert cleared_result["calendarGoneAfterClear"] is True
