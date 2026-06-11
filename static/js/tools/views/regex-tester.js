import { test } from '../operations/regex-tester.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const row = document.createElement('div'); row.className = 'tool-setting-row';
  const patInp = document.createElement('input'); patInp.type = 'text'; patInp.placeholder = '/pattern/flags'; patInp.setAttribute('aria-label', 'Regex pattern'); patInp.style.flex = '1';
  const flagsInp = document.createElement('input'); flagsInp.type = 'text'; flagsInp.placeholder = 'g'; flagsInp.value = 'g'; flagsInp.setAttribute('aria-label', 'Flags'); flagsInp.style.width = '60px';
  row.appendChild(patInp); row.appendChild(flagsInp); root.appendChild(row);
  const ta = document.createElement('textarea'); ta.className = 'tool-input-area'; ta.placeholder = 'Enter text to test...'; ta.rows = 10; ta.setAttribute('aria-label', 'Test text'); root.appendChild(ta);
  const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Test Regex'; root.appendChild(btn);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  btn.addEventListener('click', async () => {
    const pattern = patInp.value.trim(), flags = flagsInp.value.trim() || 'g', text = ta.value;
    if (!pattern) { onStatusChange('Please enter a regex pattern.', 'error'); return; }
    onStatusChange('Testing...', 'running');
    try {
      const { run, artifact } = await executeTool({ toolId: 'regex-tester', owner: 'default', operationFn: (d) => test(d, { pattern, flags }), input: text, settings: { operation: 'test' }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Matches: ' + (artifact.meta.matchCount || 0), saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Test complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  });
  return root;
}
