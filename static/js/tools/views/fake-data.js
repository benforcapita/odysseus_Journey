import { generate } from '../operations/fake-data.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const row = document.createElement('div'); row.className = 'tool-setting-row';
  const lbl = document.createElement('label'); lbl.textContent = 'Records: '; const inp = document.createElement('input'); inp.type = 'number'; inp.value = '10'; inp.min = '1'; inp.max = '100'; lbl.appendChild(inp); row.appendChild(lbl); root.appendChild(row);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Generate Fake Data'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    onStatusChange('Generating...', 'running');
    try {
      const count = parseInt(inp.value, 10) || 10;
      const { run, artifact } = await executeTool({ toolId: 'fake-data', owner: 'default', operationFn: (d) => generate(d, { count }), input: '', settings: { operation: 'generate', count }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Fake Data (CSV)', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/csv' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange(count + ' records generated.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
