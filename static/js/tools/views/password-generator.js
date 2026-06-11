import { generate } from '../operations/password-generator.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const row1 = document.createElement('div'); row1.className = 'tool-setting-row';
  const lbl = document.createElement('label'); lbl.textContent = 'Length: '; const inp = document.createElement('input'); inp.type = 'number'; inp.value = '20'; inp.min = '8'; inp.max = '128'; lbl.appendChild(inp); row1.appendChild(lbl); root.appendChild(row1);
  const row2 = document.createElement('div'); row2.className = 'tool-setting-row';
  const types = { upper: 'A-Z', lower: 'a-z', digits: '0-9', symbols: '!@#' };
  const cbs = {};
  for (const [k, v] of Object.entries(types)) {
    const l = document.createElement('label'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = k !== 'symbols'; l.appendChild(cb); l.appendChild(document.createTextNode(' ' + v)); row2.appendChild(l); cbs[k] = cb;
  }
  root.appendChild(row2);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Generate Password'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    onStatusChange('Generating...', 'running');
    try {
      const settings = { length: parseInt(inp.value, 10) || 20, upper: cbs.upper.checked, lower: cbs.lower.checked, digits: cbs.digits.checked, symbols: cbs.symbols.checked };
      const { run, artifact } = await executeTool({ toolId: 'password-generator', owner: 'default', operationFn: (d) => generate(d, settings), input: '', settings: { operation: 'generate', ...settings }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Password', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Password generated.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
