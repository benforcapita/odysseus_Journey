import { convert } from '../operations/number-base-converter.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const row1 = document.createElement('div'); row1.className = 'tool-setting-row';
  const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Number'; inp.setAttribute('aria-label', 'Number'); row1.appendChild(inp); root.appendChild(row1);
  const row2 = document.createElement('div'); row2.className = 'tool-setting-row';
  const lbl1 = document.createElement('label'); lbl1.textContent = 'From: '; const fromSel = document.createElement('select');
  [{v:10,l:'Decimal'},{v:16,l:'Hex'},{v:2,l:'Binary'},{v:8,l:'Octal'}].forEach(x => { const o = document.createElement('option'); o.value = x.v; o.textContent = x.l; fromSel.appendChild(o); });
  lbl1.appendChild(fromSel); row2.appendChild(lbl1);
  const lbl2 = document.createElement('label'); lbl2.textContent = ' To: '; const toSel = document.createElement('select');
  [{v:16,l:'Hex'},{v:10,l:'Decimal'},{v:2,l:'Binary'},{v:8,l:'Octal'}].forEach(x => { const o = document.createElement('option'); o.value = x.v; o.textContent = x.l; if (x.v === 16) o.selected = true; toSel.appendChild(o); });
  lbl2.appendChild(toSel); row2.appendChild(lbl2); root.appendChild(row2);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Convert'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    const val = inp.value.trim(); if (!val) { onStatusChange('Please enter a number.', 'error'); return; }
    onStatusChange('Converting...', 'running');
    try {
      const s = { from: parseInt(fromSel.value), to: parseInt(toSel.value) };
      const { run, artifact } = await executeTool({ toolId: 'number-base-converter', owner: 'default', operationFn: (d) => convert(d, s), input: val, settings: { operation: 'convert', ...s }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Result', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Conversion complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
