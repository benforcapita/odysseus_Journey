import { diff } from '../operations/text-diff.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const lbl1 = document.createElement('label'); lbl1.textContent = 'Original:'; root.appendChild(lbl1);
  const ta1 = document.createElement('textarea'); ta1.className = 'tool-input-area'; ta1.rows = 8; ta1.setAttribute('aria-label', 'Original text'); root.appendChild(ta1);
  const lbl2 = document.createElement('label'); lbl2.textContent = 'Modified:'; root.appendChild(lbl2);
  const ta2 = document.createElement('textarea'); ta2.className = 'tool-input-area'; ta2.rows = 8; ta2.setAttribute('aria-label', 'Modified text'); root.appendChild(ta2);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Compare'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    const left = ta1.value, right = ta2.value; if (!left && !right) { onStatusChange('Please enter text in both fields.', 'error'); return; }
    onStatusChange('Comparing...', 'running');
    try {
      const { run, artifact } = await executeTool({ toolId: 'text-diff', owner: 'default', operationFn: (d) => diff(d, { left, right }), input: left, settings: { operation: 'diff' }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Diff', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Comparison complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
