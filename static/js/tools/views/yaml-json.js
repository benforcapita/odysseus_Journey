import { yamlToJson, jsonToYaml } from '../operations/yaml-json.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const ta = document.createElement('textarea'); ta.className = 'tool-input-area'; ta.placeholder = 'Paste YAML or JSON...'; ta.rows = 12; ta.setAttribute('aria-label', 'Input'); root.appendChild(ta);
  const actions = document.createElement('div'); actions.className = 'tool-actions';
  const y2j = document.createElement('button'); y2j.className = 'btn btn-primary'; y2j.textContent = 'YAML → JSON'; actions.appendChild(y2j);
  const j2y = document.createElement('button'); j2y.className = 'btn btn-secondary'; j2y.textContent = 'JSON → YAML'; actions.appendChild(j2y);
  root.appendChild(actions);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  async function run(fn, opName) {
    const text = ta.value.trim(); if (!text) { onStatusChange('Please enter data.', 'error'); return; }
    onStatusChange('Converting...', 'running');
    try {
      const { run, artifact } = await executeTool({ toolId: 'yaml-json', owner: 'default', operationFn: (d) => fn(d), input: text, settings: { operation: opName }, fetchImpl });
      out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
      const oa = createOutputArea({ label: 'Result', saveLabel: 'Save to Library', onDownload: () => { const b = new Blob([artifact.data], { type: 'text/plain' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = artifact.name; a.click(); URL.revokeObjectURL(u); }, onSave: async () => { await saveOutput(artifact, run.id, fetchImpl); onStatusChange('Saved.', 'success'); } });
      out.appendChild(oa); onStatusChange('Conversion complete.', 'success');
    } catch (e) { onStatusChange('Error: ' + e.message, 'error'); }
  }
  y2j.addEventListener('click', () => run(yamlToJson, 'yaml-to-json'));
  j2y.addEventListener('click', () => run(jsonToYaml, 'json-to-yaml'));
  return root;
}
