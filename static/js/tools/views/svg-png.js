import { convert } from '../operations/svg-png.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const ta = document.createElement('textarea'); ta.className = 'tool-input-area'; ta.placeholder = 'Paste SVG markup or select a file...'; ta.rows = 10; ta.setAttribute('aria-label', 'SVG input'); root.appendChild(ta);
  const fileInp = document.createElement('input'); fileInp.type = 'file'; fileInp.accept = '.svg'; root.appendChild(fileInp);
  const row = document.createElement('div'); row.className = 'tool-setting-row';
  const wl = document.createElement('label'); wl.textContent = 'Width: '; const wi = document.createElement('input'); wi.type = 'number'; wi.value = '512'; wi.min = '1'; wl.appendChild(wi); row.appendChild(wl);
  const hl = document.createElement('label'); hl.textContent = ' Height: '; const hi = document.createElement('input'); hi.type = 'number'; hi.value = '512'; hi.min = '1'; hl.appendChild(hi); row.appendChild(hl); root.appendChild(row);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Convert to PNG'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    const file = fileInp.files[0]; const svgText = file ? await file.text() : ta.value.trim(); if (!svgText) { onStatusChange('Please provide an SVG.', 'error'); return; }
    onStatusChange('Converting...', 'running');
    try {
      const s = { width: parseInt(wi.value, 10) || 512, height: parseInt(hi.value, 10) || 512 };
      const { run, artifact } = await executeTool({ toolId: 'svg-png', owner: 'default', operationFn: (d) => convert(d, s), input: svgText, settings: { operation: 'convert', ...s }, fetchImpl });
      out.innerHTML = ''; const img = document.createElement('img'); img.src = artifact.data; img.className = 'tool-output-image'; img.alt = 'Converted PNG'; out.appendChild(img);
      const oa = createOutputArea({ label: 'PNG', saveLabel: 'Save to Gallery', onDownload: () => { const a = document.createElement('a'); a.href = artifact.data; a.download = artifact.name; a.click(); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Conversion complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
