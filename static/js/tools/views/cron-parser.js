import { parse } from '../operations/cron-parser.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'tool-input-text'; inp.placeholder = '*/5 * * * *'; inp.setAttribute('aria-label', 'Cron expression'); root.appendChild(inp);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Parse Cron'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  async function run() {
    const expr = inp.value.trim(); if (!expr) { onStatusChange('Please enter a cron expression.', 'error'); return; }
    onStatusChange('Parsing...', 'running');
    try {
      const { run, artifact } = await executeTool({ toolId: 'cron-parser', owner: 'default', operationFn: (d) => parse(d), input: expr, settings: { operation: 'parse' }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Cron', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Cron parsed.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  }
  btn.addEventListener('click', run);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  return root;
}
