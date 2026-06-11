/** View module for the QR Code Generator tool. */

import { generate } from '../operations/qr-generator.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';

export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');

  // Text/URL input
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tool-input-text';
  input.placeholder = 'Enter text or URL...';
  input.setAttribute('aria-label', 'Text or URL to encode');
  root.appendChild(input);

  // Size picker
  const sizeRow = document.createElement('div');
  sizeRow.className = 'tool-setting-row';
  const sizeLabel = document.createElement('label');
  sizeLabel.textContent = 'Size: ';
  const sizeInput = document.createElement('input');
  sizeInput.type = 'number';
  sizeInput.value = '256';
  sizeInput.min = '64';
  sizeInput.max = '1024';
  sizeInput.setAttribute('aria-label', 'QR code size in pixels');
  sizeLabel.appendChild(sizeInput);
  sizeRow.appendChild(sizeLabel);
  root.appendChild(sizeRow);

  // Generate button
  const generateBtn = document.createElement('button');
  generateBtn.className = 'btn btn-primary';
  generateBtn.textContent = 'Generate QR Code';
  root.appendChild(generateBtn);

  // Output area
  const outputContainer = document.createElement('div');
  outputContainer.className = 'tool-output-container';
  root.appendChild(outputContainer);

  generateBtn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) {
      onStatusChange('Please enter some text or a URL.', 'error');
      return;
    }
    onStatusChange('Generating QR code...', 'running');
    try {
      const size = parseInt(sizeInput.value, 10) || 256;
      const { run, artifact } = await executeTool({
        toolId: 'qr-generator',
        owner: 'default',
        operationFn: (data) => generate(data, { size }),
        input: text,
        settings: { operation: 'generate', size },
        fetchImpl,
      });

      outputContainer.innerHTML = '';

      // Show the QR image
      const img = document.createElement('img');
      img.src = artifact.data;
      img.alt = 'QR Code: ' + text;
      img.className = 'tool-output-image';
      outputContainer.appendChild(img);

      const outputArea = createOutputArea({
        label: 'QR Code',
        saveLabel: 'Save to Gallery',
        onDownload: () => {
          const a = document.createElement('a');
          a.href = artifact.data;
          a.download = artifact.name;
          a.click();
        },
        onSave: async () => {
          await saveOutput(artifact, run.id, fetchImpl);
          onStatusChange('Saved to Gallery.', 'success');
        },
      });
      outputContainer.appendChild(outputArea);

      onStatusChange('QR code generated.', 'success');
    } catch (err) {
      onStatusChange('Error: ' + err.message, 'error');
    }
  });

  return root;
}
