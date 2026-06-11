import { convert } from '../operations/color-converter.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'tool-input-text'; inp.placeholder = '#ff0000 or rgb(255,0,0) or hsl(0,100%,50%)'; inp.setAttribute('aria-label', 'Color value'); root.appendChild(inp);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Convert'; root.appendChild(btn);
  // Live color preview
  const preview = document.createElement('div'); preview.style.width = '100px'; preview.style.height = '40px'; preview.style.border = '1px solid var(--border)'; preview.style.marginTop = '8px'; root.appendChild(preview);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  async function run() {
    const val = inp.value.trim(); if (!val) { onStatusChange('Please enter a color.', 'error'); return; }
    onStatusChange('Converting...', 'running');
    try {
      const { run, artifact } = await executeTool({ toolId: 'color-converter', owner: 'default', operationFn: (d) => convert(d), input: val, settings: { operation: 'convert' }, fetchImpl });
      preview.style.backgroundColor = artifact.meta.hex;
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Color', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Conversion complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  }
  btn.addEventListener('click', run);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  return root;
}
