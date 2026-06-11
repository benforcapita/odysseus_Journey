import { sort } from '../operations/text-sorter.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const ta = document.createElement('textarea'); ta.className = 'tool-input-area'; ta.placeholder = 'Enter lines to sort...'; ta.rows = 10; ta.setAttribute('aria-label', 'Input'); root.appendChild(ta);
  const row = document.createElement('div'); row.className = 'tool-setting-row';
  const sel = document.createElement('select'); ['alphabetical','numeric','length','random'].forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); }); row.appendChild(sel);
  const dirSel = document.createElement('select'); ['asc','desc'].forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; dirSel.appendChild(o); }); row.appendChild(dirSel);
  root.appendChild(row);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Sort'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    const text = ta.value; if (!text) { onStatusChange('Please enter text.', 'error'); return; }
    onStatusChange('Sorting...', 'running');
    try {
      const s = { method: sel.value, direction: dirSel.value };
      const { run, artifact } = await executeTool({ toolId: 'text-sorter', owner: 'default', operationFn: (d) => sort(d, s), input: text, settings: { operation: 'sort', ...s }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Sorted', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Sort complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
