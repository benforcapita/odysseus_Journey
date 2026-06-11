import { generate } from '../operations/lorem-ipsum.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const row = document.createElement('div'); row.className = 'tool-setting-row';
  const lbl = document.createElement('label'); lbl.textContent = 'Count: '; const inp = document.createElement('input'); inp.type = 'number'; inp.value = '3'; inp.min = '1'; inp.max = '50'; lbl.appendChild(inp); row.appendChild(lbl);
  const sel = document.createElement('select'); ['paragraphs','sentences','words'].forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); }); row.appendChild(sel); root.appendChild(row);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Generate'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    onStatusChange('Generating...', 'running');
    try {
      const s = { count: parseInt(inp.value, 10) || 3, mode: sel.value };
      const { run, artifact } = await executeTool({ toolId: 'lorem-ipsum', owner: 'default', operationFn: (d) => generate(d, s), input: '', settings: { operation: 'generate', ...s }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Lorem Ipsum', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Generated.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
