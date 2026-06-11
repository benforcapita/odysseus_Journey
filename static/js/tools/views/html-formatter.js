import { prettyPrint, minify } from '../operations/html-formatter.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const ta = document.createElement('textarea'); ta.className = 'tool-input-area'; ta.placeholder = 'Paste HTML...'; ta.rows = 12; ta.setAttribute('aria-label', 'HTML input'); root.appendChild(ta);
  const actions = document.createElement('div'); actions.className = 'tool-actions';
  const ppBtn = document.createElement('button'); ppBtn.className = 'btn btn-primary'; ppBtn.textContent = 'Pretty Print'; actions.appendChild(ppBtn);
  const minBtn = document.createElement('button'); minBtn.className = 'btn btn-secondary'; minBtn.textContent = 'Minify'; actions.appendChild(minBtn);
  root.appendChild(actions);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  async function run(fn, opName) {
    const text = ta.value.trim(); if (!text) { onStatusChange('Please enter HTML.', 'error'); return; }
    onStatusChange(opName + '...', 'running');
    try {
      const { run, artifact } = await executeTool({ toolId: 'html-formatter', owner: 'default', operationFn: (d) => fn(d), input: text, settings: { operation: opName }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Result', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/html' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange(opName + ' complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  }
  ppBtn.addEventListener('click', () => run(prettyPrint, 'pretty-print'));
  minBtn.addEventListener('click', () => run(minify, 'minify'));
  return root;
}
