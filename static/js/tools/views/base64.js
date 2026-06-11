import { encode, decode } from '../operations/base64.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const ta = document.createElement('textarea'); ta.className = 'tool-input-area'; ta.placeholder = 'Enter text to encode/decode...'; ta.rows = 10; ta.setAttribute('aria-label', 'Input'); root.appendChild(ta);
  const actions = document.createElement('div'); actions.className = 'tool-actions';
  const encBtn = document.createElement('button'); encBtn.className = 'btn btn-primary'; encBtn.textContent = 'Encode'; actions.appendChild(encBtn);
  const decBtn = document.createElement('button'); decBtn.className = 'btn btn-secondary'; decBtn.textContent = 'Decode'; actions.appendChild(decBtn);
  root.appendChild(actions);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  async function run(fn, opName) {
    const text = ta.value.trim(); if (!text) { onStatusChange('Please enter text.', 'error'); return; }
    onStatusChange(opName + '...', 'running');
    try {
      const { run, artifact } = await executeTool({ toolId: 'base64', owner: 'default', operationFn: (d) => fn(d), input: text, settings: { operation: opName }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Result', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange(opName + ' complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  }
  encBtn.addEventListener('click', () => run(encode, 'encode'));
  decBtn.addEventListener('click', () => run(decode, 'decode'));
  return root;
}
