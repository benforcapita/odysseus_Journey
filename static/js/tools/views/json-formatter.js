/** View module for the JSON Formatter tool. */

import { prettyPrint, minify, validate } from '../operations/json-formatter.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';

/**
 * Render the JSON Formatter UI.
 * @param {object} ctx
 * @param {typeof fetch} ctx.fetchImpl
 * @param {function} ctx.onStatusChange
 * @returns {Promise<HTMLElement>}
 */
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');

  // Input textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'tool-input-area';
  textarea.placeholder = 'Paste JSON here...';
  textarea.rows = 12;
  textarea.setAttribute('aria-label', 'JSON input');
  root.appendChild(textarea);

  // Indent setting
  const indentRow = document.createElement('div');
  indentRow.className = 'tool-setting-row';
  const indentLabel = document.createElement('label');
  indentLabel.textContent = 'Indent: ';
  const indentInput = document.createElement('input');
  indentInput.type = 'number';
  indentInput.value = '2';
  indentInput.min = '0';
  indentInput.max = '8';
  indentInput.setAttribute('aria-label', 'Indentation spaces');
  indentLabel.appendChild(indentInput);
  indentRow.appendChild(indentLabel);
  root.appendChild(indentRow);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'tool-actions';

  const prettyBtn = document.createElement('button');
  prettyBtn.className = 'btn btn-primary';
  prettyBtn.textContent = 'Pretty Print';
  actions.appendChild(prettyBtn);

  const minifyBtn = document.createElement('button');
  minifyBtn.className = 'btn btn-secondary';
  minifyBtn.textContent = 'Minify';
  actions.appendChild(minifyBtn);

  const validateBtn = document.createElement('button');
  validateBtn.className = 'btn btn-secondary';
  validateBtn.textContent = 'Validate';
  actions.appendChild(validateBtn);

  root.appendChild(actions);

  // Output area
  const outputContainer = document.createElement('div');
  outputContainer.className = 'tool-output-container';
  root.appendChild(outputContainer);

  async function runOperation(operationFn, opName) {
    const input = textarea.value.trim();
    if (!input) {
      onStatusChange('Please enter some JSON.', 'error');
      return;
    }
    onStatusChange('Running ' + opName + '...', 'running');
    try {
      const settings = { indent: parseInt(indentInput.value, 10) || 2 };
      const { artifact } = await executeTool({
        toolId: 'json-formatter',
        owner: 'default',
        operationFn: (data) => operationFn(data, settings),
        input,
        settings: { operation: opName },
        fetchImpl,
      });

      outputContainer.innerHTML = '';
      const resultLabel = document.createElement('div');
      resultLabel.textContent = artifact.kind === 'text' ? artifact.data : '';
      resultLabel.className = 'tool-output-text';
      outputContainer.appendChild(resultLabel);

      const outputArea = createOutputArea({
        label: 'Result',
        saveLabel: 'Save to Library',
        onDownload: () => {
          const blob = new Blob([artifact.data], { type: artifact.mime });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = artifact.name;
          a.click();
          URL.revokeObjectURL(url);
        },
        onSave: async () => {
          await saveOutput(artifact, '{runId}', fetchImpl);  // runId from executeTool
          onStatusChange('Saved to Library.', 'success');
        },
      });
      outputContainer.appendChild(outputArea);

      onStatusChange(opName + ' complete.', 'success');
    } catch (err) {
      onStatusChange('Error: ' + err.message, 'error');
    }
  }

  prettyBtn.addEventListener('click', () => runOperation(prettyPrint, 'Pretty Print'));
  minifyBtn.addEventListener('click', () => runOperation(minify, 'Minify'));
  validateBtn.addEventListener('click', () => runOperation(validate, 'Validate'));

  return root;
}
