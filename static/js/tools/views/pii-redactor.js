/** View module for the Structured PII Redactor tool. */

import { redact } from '../operations/pii-redactor.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';

export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');

  const textarea = document.createElement('textarea');
  textarea.className = 'tool-input-area';
  textarea.placeholder = 'Paste text containing emails, phone numbers, credit card numbers, or SSNs...';
  textarea.rows = 12;
  textarea.setAttribute('aria-label', 'Text input');
  root.appendChild(textarea);

  // Type checkboxes
  const checkRow = document.createElement('div');
  checkRow.className = 'tool-setting-row';
  const types = ['email', 'phone', 'credit-card', 'ssn'];
  const checkboxes = {};
  for (const t of types) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.value = t;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + t));
    checkRow.appendChild(label);
    checkboxes[t] = cb;
  }
  root.appendChild(checkRow);

  const redactBtn = document.createElement('button');
  redactBtn.className = 'btn btn-primary';
  redactBtn.textContent = 'Redact PII';
  root.appendChild(redactBtn);

  const outputContainer = document.createElement('div');
  outputContainer.className = 'tool-output-container';
  root.appendChild(outputContainer);

  redactBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) {
      onStatusChange('Please enter some text.', 'error');
      return;
    }
    const enabledTypes = types.filter(t => checkboxes[t].checked);
    onStatusChange('Redacting PII...', 'running');
    try {
      const { run, artifact } = await executeTool({
        toolId: 'pii-redactor',
        owner: 'default',
        operationFn: (data) => redact(data, { types: enabledTypes }),
        input: text,
        settings: { operation: 'redact', types: enabledTypes },
        fetchImpl,
      });

      outputContainer.innerHTML = '';

      // Show what was found
      if (artifact.meta && artifact.meta.found) {
        const summary = document.createElement('div');
        summary.className = 'tool-redact-summary';
        const parts = [];
        for (const [k, v] of Object.entries(artifact.meta.found)) {
          parts.push(k + ': ' + v);
        }
        summary.textContent = 'Found: ' + parts.join(', ');
        outputContainer.appendChild(summary);
      }

      const result = document.createElement('pre');
      result.className = 'tool-output-text';
      result.textContent = artifact.data;
      outputContainer.appendChild(result);

      const outputArea = createOutputArea({
        label: 'Redacted text',
        saveLabel: 'Save to Library',
        onDownload: () => {
          const blob = new Blob([artifact.data], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = artifact.name;
          a.click();
          URL.revokeObjectURL(url);
        },
        onSave: async () => {
          await saveOutput(artifact, run.id, fetchImpl);
          onStatusChange('Saved to Library.', 'success');
        },
      });
      outputContainer.appendChild(outputArea);
      onStatusChange('Redaction complete.', 'success');
    } catch (err) {
      onStatusChange('Error: ' + err.message, 'error');
    }
  });

  return root;
}
