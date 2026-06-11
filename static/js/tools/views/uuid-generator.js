import { generate } from '../operations/uuid-generator.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const row = document.createElement('div'); row.className = 'tool-setting-row';
  const lbl = document.createElement('label'); lbl.textContent = 'Count: '; const inp = document.createElement('input'); inp.type = 'number'; inp.value = '5'; inp.min = '1'; inp.max = '100'; lbl.appendChild(inp); row.appendChild(lbl); root.appendChild(row);
  const genBtn = document.createElement('button'); genBtn.className = 'btn btn-primary'; genBtn.textContent = 'Generate UUIDs'; root.appendChild(genBtn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  genBtn.addEventListener('click', async () => {
    const count = parseInt(inp.value, 10) || 5;
    onStatusChange('Generating...', 'running');
    try {
      const { run, artifact } = await executeTool({ toolId: 'uuid-generator', owner: 'default', operationFn: (d) => generate(d, { count }), input: '', settings: { operation: 'generate', count }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'UUIDs', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange(count + ' UUIDs generated.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
