import { hash } from '../operations/hash-generator.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const ta = document.createElement('textarea'); ta.className = 'tool-input-area'; ta.placeholder = 'Enter text to hash...'; ta.rows = 8; ta.setAttribute('aria-label', 'Input'); root.appendChild(ta);
  const row = document.createElement('div'); row.className = 'tool-setting-row';
  const lbl = document.createElement('label'); lbl.textContent = 'Algorithm: '; const sel = document.createElement('select');
  ['SHA-256','SHA-384','SHA-512'].forEach(a => { const o = document.createElement('option'); o.value = a; o.textContent = a; sel.appendChild(o); });
  lbl.appendChild(sel); row.appendChild(lbl); root.appendChild(row);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Generate Hash'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    const text = ta.value; if (!text) { onStatusChange('Please enter text.', 'error'); return; }
    onStatusChange('Hashing...', 'running');
    try {
      const algo = sel.value;
      const { run, artifact } = await executeTool({ toolId: 'hash-generator', owner: 'default', operationFn: (d) => hash(d, { algorithm: algo }), input: text, settings: { operation: 'hash', algorithm: algo }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = algo + ': ' + artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Hash', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Hash complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
