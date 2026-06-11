import { decode } from '../operations/jwt-decoder.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const ta = document.createElement('textarea'); ta.className = 'tool-input-area'; ta.placeholder = 'Paste a JWT token...'; ta.rows = 6; ta.setAttribute('aria-label', 'JWT token'); root.appendChild(ta);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Decode JWT'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    const token = ta.value.trim(); if (!token) { onStatusChange('Please paste a JWT.', 'error'); return; }
    onStatusChange('Decoding...', 'running');
    try {
      const { run, artifact } = await executeTool({ toolId: 'jwt-decoder', owner: 'default', operationFn: (d) => decode(d), input: token, settings: { operation: 'decode' }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Decoded JWT', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('JWT decoded.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
