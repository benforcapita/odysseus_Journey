/** View module for the Image Resizer tool. */

import { resize, rotate } from '../operations/image-resizer.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';

export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');

  // File input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.setAttribute('aria-label', 'Choose an image file');
  root.appendChild(fileInput);

  // Dimension inputs
  const dimsRow = document.createElement('div');
  dimsRow.className = 'tool-setting-row';
  const wLabel = document.createElement('label');
  wLabel.textContent = 'Width: ';
  const wInput = document.createElement('input');
  wInput.type = 'number';
  wInput.value = '800';
  wInput.min = '1';
  wInput.setAttribute('aria-label', 'Target width');
  wLabel.appendChild(wInput);
  dimsRow.appendChild(wLabel);

  const hLabel = document.createElement('label');
  hLabel.textContent = ' Height: ';
  const hInput = document.createElement('input');
  hInput.type = 'number';
  hInput.value = '600';
  hInput.min = '1';
  hInput.setAttribute('aria-label', 'Target height');
  hLabel.appendChild(hInput);
  dimsRow.appendChild(hLabel);

  root.appendChild(dimsRow);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'tool-actions';

  const resizeBtn = document.createElement('button');
  resizeBtn.className = 'btn btn-primary';
  resizeBtn.textContent = 'Resize';
  actions.appendChild(resizeBtn);

  const rotateBtn = document.createElement('button');
  rotateBtn.className = 'btn btn-secondary';
  rotateBtn.textContent = 'Rotate 90°';
  actions.appendChild(rotateBtn);

  root.appendChild(actions);

  // Output
  const outputContainer = document.createElement('div');
  outputContainer.className = 'tool-output-container';
  root.appendChild(outputContainer);

  async function runOp(file, opFn, opName, settings) {
    onStatusChange(opName + '...', 'running');
    try {
      const { run, artifact } = await executeTool({
        toolId: 'image-resizer',
        owner: 'default',
        operationFn: (data) => opFn(data, settings),
        input: file,
        settings: { operation: opName, ...settings },
        fetchImpl,
      });

      outputContainer.innerHTML = '';
      const img = document.createElement('img');
      img.src = artifact.data;
      img.alt = opName + ' image';
      img.className = 'tool-output-image';
      outputContainer.appendChild(img);

      const outputArea = createOutputArea({
        label: 'Result',
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
      onStatusChange(opName + ' complete.', 'success');
    } catch (err) {
      onStatusChange('Error: ' + err.message, 'error');
    }
  }

  resizeBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) { onStatusChange('Please select an image.', 'error'); return; }
    runOp(file, resize, 'Resize', { width: parseInt(wInput.value, 10), height: parseInt(hInput.value, 10) });
  });

  rotateBtn.addEventListener('click', () => {
    const file = fileInput.files[0];
    if (!file) { onStatusChange('Please select an image.', 'error'); return; }
    runOp(file, rotate, 'Rotate', { degrees: 90 });
  });

  return root;
}
