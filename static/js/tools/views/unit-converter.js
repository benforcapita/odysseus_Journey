import { convert } from '../operations/unit-converter.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const catRow = document.createElement('div'); catRow.className = 'tool-setting-row';
  const catSel = document.createElement('select');
  ['length','mass','temperature','area','volume','speed'].forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });
  catRow.appendChild(catSel); root.appendChild(catRow);
  const convRow = document.createElement('div'); convRow.className = 'tool-setting-row';
  const inp = document.createElement('input'); inp.type = 'number'; inp.value = '1'; inp.setAttribute('aria-label', 'Value'); inp.style.width = '100px'; convRow.appendChild(inp);
  const fSel = document.createElement('select'); ['m','km','cm','mm','mi','yd','ft','in'].forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u; fSel.appendChild(o); }); convRow.appendChild(fSel);
  const arrow = document.createElement('span'); arrow.textContent = ' → '; convRow.appendChild(arrow);
  const tSel = document.createElement('select'); ['ft','m','km','cm','mm','mi','yd','in'].forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u; tSel.appendChild(o); }); convRow.appendChild(tSel);
  root.appendChild(convRow);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Convert'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    const val = inp.value; if (!val) { onStatusChange('Please enter a value.', 'error'); return; }
    onStatusChange('Converting...', 'running');
    try {
      const s = { category: catSel.value, from: fSel.value, to: tSel.value };
      const { run, artifact } = await executeTool({ toolId: 'unit-converter', owner: 'default', operationFn: (d) => convert(d, s), input: val, settings: { operation: 'convert', ...s }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Result', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Conversion complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
