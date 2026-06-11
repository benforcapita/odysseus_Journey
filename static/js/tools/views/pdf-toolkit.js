/** View module for the PDF Toolkit — merge and split PDFs. */

import { merge, split } from '../operations/pdf-toolkit.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';

export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');

  // File input (multiple for merge)
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/pdf,.pdf';
  fileInput.multiple = true;
  fileInput.setAttribute('aria-label', 'Select PDF files');
  root.appendChild(fileInput);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'tool-actions';

  const mergeBtn = document.createElement('button');
  mergeBtn.className = 'btn btn-primary';
  mergeBtn.textContent = 'Merge PDFs';
  actions.appendChild(mergeBtn);

  const splitBtn = document.createElement('button');
  splitBtn.className = 'btn btn-secondary';
  splitBtn.textContent = 'Split PDF';
  actions.appendChild(splitBtn);

  root.appendChild(actions);

  const outputContainer = document.createElement('div');
  outputContainer.className = 'tool-output-container';
  root.appendChild(outputContainer);

  mergeBtn.addEventListener('click', async () => {
    const files = Array.from(fileInput.files);
    if (files.length < 2) {
      onStatusChange('Please select at least two PDF files to merge.', 'error');
      return;
    }
    onStatusChange('Merging PDFs...', 'running');
    try {
      const { run, artifact } = await executeTool({
        toolId: 'pdf-toolkit',
        owner: 'default',
        operationFn: (data) => merge(data),
        input: files,
        settings: { operation: 'merge' },
        fetchImpl,
      });

      outputContainer.innerHTML = '';
      const info = document.createElement('div');
      info.textContent = 'Merged ' + files.length + ' files into ' + (artifact.meta.pageCount || '?') + ' pages.';
      outputContainer.appendChild(info);

      const outputArea = createOutputArea({
        label: 'Merged PDF',
        saveLabel: 'Save to Library',
        onDownload: () => {
          const url = URL.createObjectURL(artifact.data);
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
      onStatusChange('Merge complete.', 'success');
    } catch (err) {
      onStatusChange('Error: ' + err.message, 'error');
    }
  });

  splitBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) {
      onStatusChange('Please select a PDF file to split.', 'error');
      return;
    }
    onStatusChange('Splitting PDF...', 'running');
    try {
      const { run, artifact } = await executeTool({
        toolId: 'pdf-toolkit',
        owner: 'default',
        operationFn: (data) => split(data),
        input: file,
        settings: { operation: 'split' },
        fetchImpl,
      });

      outputContainer.innerHTML = '';
      const artifacts = Array.isArray(artifact) ? artifact : [artifact];
      for (const a of artifacts) {
        const row = document.createElement('div');
        row.className = 'tool-split-row';
        row.textContent = a.name;

        const dlBtn = document.createElement('button');
        dlBtn.textContent = 'Download';
        dlBtn.addEventListener('click', () => {
          const url = URL.createObjectURL(a.data);
          const el = document.createElement('a');
          el.href = url;
          el.download = a.name;
          el.click();
          URL.revokeObjectURL(url);
        });
        row.appendChild(dlBtn);
        outputContainer.appendChild(row);
      }

      onStatusChange('Split into ' + artifacts.length + ' pages.', 'success');
    } catch (err) {
      onStatusChange('Error: ' + err.message, 'error');
    }
  });

  return root;
}
