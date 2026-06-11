/**
 * Shared workspace shell for native tools.
 *
 * Every tool view renders inside a shared shell that provides a header with
 * name/description, a capability summary, an aria-live execution status region,
 * and a consistent output area with download and save actions.
 */

/**
 * Render the workspace shell around a tool's content element.
 *
 * @param {object} opts
 * @param {string} opts.toolId
 * @param {string} opts.toolName
 * @param {string} opts.toolDescription
 * @param {string[]} opts.capabilities
 * @param {HTMLElement} opts.content - The tool's main DOM content.
 * @returns {HTMLElement} The workspace root element.
 */
export function createWorkspace({ toolId, toolName, toolDescription, capabilities, content }) {
  const root = document.createElement('div');
  root.className = 'tool-workspace';
  root.setAttribute('data-tool-id', toolId);

  // Header
  const header = document.createElement('div');
  header.className = 'tool-workspace-header';

  const title = document.createElement('h2');
  title.textContent = toolName;
  header.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'tool-workspace-description';
  desc.textContent = toolDescription;
  header.appendChild(desc);

  // Status badge
  const statusBadge = document.createElement('span');
  statusBadge.className = 'tool-status-badge';
  statusBadge.textContent = 'Runs locally';
  statusBadge.setAttribute('aria-label', 'This tool runs entirely in your browser');
  header.appendChild(statusBadge);

  root.appendChild(header);

  // Capability summary
  if (capabilities.length > 0) {
    const capRow = document.createElement('div');
    capRow.className = 'tool-capabilities';
    capRow.textContent = 'Capabilities: ' + capabilities.join(', ');
    root.appendChild(capRow);
  }

  // Live region for execution status
  const liveRegion = document.createElement('div');
  liveRegion.className = 'tool-execution-status';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('role', 'status');
  root.appendChild(liveRegion);

  // Content area
  content.classList.add('tool-workspace-content');
  root.appendChild(content);

  return root;
}

/**
 * Update the execution status live region.
 * @param {HTMLElement} workspaceRoot
 * @param {string} message
 * @param {'idle'|'running'|'success'|'error'} [state='idle']
 */
export function setExecutionStatus(workspaceRoot, message, state = 'idle') {
  const region = workspaceRoot.querySelector('.tool-execution-status');
  if (!region) return;
  region.textContent = message;
  region.className = 'tool-execution-status status-' + state;
}

/**
 * Create a consistent output area with download and save buttons.
 * @param {object} opts
 * @param {string} opts.label - Display label for the output.
 * @param {function} opts.onDownload - Called when Download is clicked.
 * @param {function} opts.onSave - Called when Save is clicked.
 * @param {string} [opts.saveLabel] - Label for the save button (e.g. "Save to Gallery").
 * @param {boolean} [opts.showSave=true]
 * @returns {HTMLElement}
 */
export function createOutputArea({ label, onDownload, onSave, saveLabel = 'Save', showSave = true }) {
  const container = document.createElement('div');
  container.className = 'tool-output-area';

  const labelEl = document.createElement('div');
  labelEl.className = 'tool-output-label';
  labelEl.textContent = label;
  container.appendChild(labelEl);

  const actions = document.createElement('div');
  actions.className = 'tool-output-actions';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn btn-secondary';
  downloadBtn.textContent = 'Download';
  downloadBtn.addEventListener('click', onDownload);
  actions.appendChild(downloadBtn);

  if (showSave) {
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = saveLabel;
    saveBtn.addEventListener('click', onSave);
    actions.appendChild(saveBtn);
  }

  container.appendChild(actions);
  return container;
}
