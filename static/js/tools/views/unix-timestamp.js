import { toDate, toTimestamp } from '../operations/unix-timestamp.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const row = document.createElement('div'); row.className = 'tool-setting-row';
  const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Enter timestamp or date...'; inp.setAttribute('aria-label', 'Input'); inp.style.flex = '1'; row.appendChild(inp); root.appendChild(row);
  const actions = document.createElement('div'); actions.className = 'tool-actions';
  const ts2d = document.createElement('button'); ts2d.className = 'btn btn-primary'; ts2d.textContent = 'Timestamp → Date'; actions.appendChild(ts2d);
  const d2ts = document.createElement('button'); d2ts.className = 'btn btn-secondary'; d2ts.textContent = 'Date → Timestamp'; actions.appendChild(d2ts);
  root.appendChild(actions);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  async function run(fn, opName) {
    const text = inp.value.trim(); if (!text) { onStatusChange('Please enter a value.', 'error'); return; }
    onStatusChange('Converting...', 'running');
    try {
      const { run, artifact } = await executeTool({ toolId: 'unix-timestamp', owner: 'default', operationFn: (d) => fn(d), input: text, settings: { operation: opName }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Result', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Conversion complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  }
  ts2d.addEventListener('click', () => run(toDate, 'to-date'));
  d2ts.addEventListener('click', () => run(toTimestamp, 'to-timestamp'));
  return root;
}
