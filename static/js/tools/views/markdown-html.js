import { convert } from '../operations/markdown-html.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const ta = document.createElement('textarea'); ta.className = 'tool-input-area'; ta.placeholder = 'Enter Markdown...'; ta.rows = 12; ta.setAttribute('aria-label', 'Markdown input'); root.appendChild(ta);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Convert to HTML'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    const text = ta.value.trim(); if (!text) { onStatusChange('Please enter Markdown.', 'error'); return; }
    onStatusChange('Converting...', 'running');
    try {
      const { run, artifact } = await executeTool({ toolId: 'markdown-html', owner: 'default', operationFn: (d) => convert(d), input: text, settings: { operation: 'convert' }, fetchImpl });
      out.innerHTML = ''; const raw = document.createElement('pre'); raw.className = 'tool-output-text'; raw.textContent = artifact.data; out.appendChild(raw);
      // Also show a live preview
      const preview = document.createElement('div'); preview.className = 'tool-markdown-preview'; preview.innerHTML = artifact.data; preview.style.padding = '12px'; preview.style.border = '1px solid var(--border)'; preview.style.marginTop = '8px'; out.appendChild(preview);
      const oa = createOutputArea({ label: 'HTML', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/html' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Conversion complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
