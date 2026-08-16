// Sidebar-native Projects UI controller.
//
// Projects is a macOS-desktop-only surface: it needs a real filesystem path and
// shell access the browser cannot provide, so the rail button is hidden unless
// window.pywebview.api is present. The routes return 503 in browser mode, so an
// accidental request can't partially succeed. Pure helpers (isDesktopBridgeAvailable,
// summarizeDiffStats) are exported for Node testing and avoid touching browser
// globals at import time.

const API_BASE = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
let projectModels = [];

export function isDesktopBridgeAvailable(win = window) {
  return !!(win && win.pywebview && win.pywebview.api && typeof win.pywebview.api.pick_folder === 'function');
}

function isDesktopLaunch() {
  const params = new URLSearchParams(window.location.search);
  return params.has('desktop') || params.has('desktop_token');
}

async function waitForDesktopBridge(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isDesktopBridgeAvailable(window)) return window.pywebview.api;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Desktop bridge is not ready');
}

function setStatus(message, isError = false) {
  const el = document.getElementById('projects-status');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('projects-status-error', !!isError);
}

async function pickProjectFolder() {
  if (isDesktopBridgeAvailable(window)) {
    return window.pywebview.api.pick_folder();
  }
  try {
    const bridge = await waitForDesktopBridge(2000);
    return bridge.pick_folder();
  } catch (_) {
    return api('/api/projects/pick-folder', { method: 'POST' });
  }
}

export function summarizeDiffStats(events) {
  return (events || []).reduce((acc, ev) => {
    if (!ev || !ev.diff) return acc;
    acc.files += 1;
    acc.added += Number(ev.diff.added || 0);
    acc.removed += Number(ev.diff.removed || 0);
    return acc;
  }, { files: 0, added: 0, removed: 0 });
}

export function buildProjectHeroState(project) {
  const name = (project && project.name) || '';
  return {
    title: name ? `What should we build in ${name}` : 'What should we build',
    directory: (project && (project.folder_path || project.folder_name)) || 'Choose folder',
    model: (project && project.model) || 'Default',
    branch: (project && (project.git_branch || project.branch || project.current_branch)) || 'Unknown',
    access: project && project.auto_approve ? 'Auto-approve changes' : 'Ask before changes',
  };
}

export function shouldCenterProjectComposer(project) {
  return !project || !(project.messages || []).length;
}

export function reduceProjectStreamState(state, data) {
  if (!data || typeof data.delta !== 'string') {
    return { ...state, changed: false };
  }
  return { ...state, assistantText: `${state?.assistantText || ''}${data.delta}`, changed: true };
}

export function validateProjectSubmission(project, content, modelsAvailable) {
  const text = (content || '').trim();
  if (!text) return { ok: false, error: '' };
  if (!project) return { ok: false, error: 'Choose a project folder to start chatting' };
  // Only block on a missing model when the picker actually has models to
  // choose from -- otherwise let the backend attempt and surface its error.
  if (modelsAvailable && !project.model) return { ok: false, error: 'Pick a model before sending' };
  return { ok: true, error: '' };
}

export function renderApprovalCardHtml(event) {
  const op = (event && event.operation) || {};
  const pendingId = esc(event && event.pending_id);
  const title = esc(op.summary || op.tool || 'Pending operation');
  const detail = esc(op.path || op.command || '');
  return `
    <div class="projects-approval-card" data-pending-id="${pendingId}">
      <div class="projects-approval-title">${title}</div>
      <div class="projects-approval-path">${detail}</div>
      <div class="projects-approval-actions">
        <button type="button" class="confirm-btn" data-project-approval="approve">Approve</button>
        <button type="button" class="confirm-btn confirm-btn-secondary" data-project-approval="reject">Reject</button>
        <button type="button" class="confirm-btn confirm-btn-secondary" data-project-approval="approve-continue">Approve &amp; continue</button>
      </div>
    </div>`;
}

export function renderProjectTreeHtml(entries) {
  return (entries || [])
    .filter(e => e && e.kind === 'folder')
    .map(e => `<div class="projects-file-row" title="${esc(e.path)}">${esc(e.name)}/</div>`)
    .join('') || '<div class="projects-empty">No folders</div>';
}

export function flattenProjectModels(items) {
  return (items || []).flatMap(ep => (ep.models || []).map((model, index) => ({
    model,
    displayName: (ep.models_display || ep.models || [])[index] || model,
    endpointUrl: ep.url || '',
    endpointId: ep.endpoint_id || null,
    endpointName: ep.name || '',
  })));
}

function esc(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function openProjectsView() {
  document.getElementById('chat-container')?.classList.add('hidden');
  document.getElementById('projects-view')?.classList.remove('hidden');
  document.getElementById('rail-projects')?.classList.add('active-section');
}

export function closeProjectsView(doc = document) {
  doc.getElementById('projects-view')?.classList.add('hidden');
  doc.getElementById('rail-projects')?.classList.remove('active-section');
  doc.getElementById('chat-container')?.classList.remove('hidden');
}

export function installProjectsNavigationClose(doc = document) {
  if (!doc || doc.__odysseusProjectsNavigationClose === '1') return;
  doc.__odysseusProjectsNavigationClose = '1';
  doc.addEventListener('click', (event) => {
    const nav = event.target?.closest?.('.icon-rail-btn, .list-item, .sidebar-brand');
    if (!nav || nav.id === 'rail-projects' || nav.id === 'sidebar-projects-btn') return;
    closeProjectsView(doc);
  });
}

export function initProjectsUI() {
  const view = document.getElementById('projects-view');
  const rail = document.getElementById('rail-projects');
  const sidebar = document.getElementById('sidebar-projects-btn');
  if (!view || !rail) return;
  if (isDesktopLaunch() || isDesktopBridgeAvailable(window)) {
    wireProjectsUI(rail);
    return;
  }
  if (sidebar) sidebar.style.display = 'none';
  // pywebview injects window.pywebview.api AFTER the page's own scripts run,
  // then dispatches a 'pywebviewready' event. In a plain browser the event
  // never fires, so the rail stays hidden — Projects is desktop-only.
  let poll = null;
  const onReady = () => {
    if (!isDesktopBridgeAvailable(window)) return;
    if (poll) { clearInterval(poll); poll = null; }
    window.removeEventListener('pywebviewready', onReady);
    document.removeEventListener('pywebviewready', onReady);
    wireProjectsUI(rail);
  };
  window.addEventListener('pywebviewready', onReady);
  document.addEventListener('pywebviewready', onReady);
  // Poll fallback: some backends don't dispatch the event reliably.
  poll = setInterval(() => { if (isDesktopBridgeAvailable(window)) onReady(); }, 400);
  setTimeout(() => { if (poll) { clearInterval(poll); poll = null; } }, 12000);
}

function wireProjectsUI(rail) {
  if (rail.dataset.projectsWired === '1') return;
  rail.dataset.projectsWired = '1';
  rail.style.display = '';
  const sidebarProjects = document.getElementById('sidebar-projects-btn');
  if (sidebarProjects) {
    sidebarProjects.style.display = '';
    sidebarProjects.addEventListener('click', () => openProjectsView());
  }
  rail.addEventListener('click', () => openProjectsView());
  document.getElementById('projects-form')?.addEventListener('submit', sendProjectPrompt);
  // Composer keyboard + auto-resize wiring, mirroring the main chat composer:
  // Enter sends (Shift+Enter for a newline), and the textarea grows to fit
  // multi-line input instead of staying pinned at one row.
  const _projectsInput = document.getElementById('projects-input');
  if (_projectsInput) {
    _projectsInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.shiftKey || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (window.innerWidth <= 768) return; // mobile: keep newline entry
      e.preventDefault();
      const form = document.getElementById('projects-form');
      if (!form) return;
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });
    _projectsInput.addEventListener('input', () => autoResizeProjectInput(_projectsInput));
  }
  document.getElementById('projects-reveal-btn')?.addEventListener('click', createProjectFromPicker);
  // Composer affordance: quick-access icon that reveals the active project's
  // working directory in Finder. Reuses the existing revealActiveProject
  // helper — no new logic, just a second entry point from the chat composer.
  document.getElementById('projects-compose-reveal')?.addEventListener('click', revealActiveProject);
  document.getElementById('projects-auto-approve')?.addEventListener('change', toggleAutoApprove);
  document.getElementById('projects-access-btn')?.addEventListener('click', toggleAccessButton);
  document.getElementById('projects-files-toggle')?.addEventListener('click', toggleProjectsSidebar);
  document.getElementById('projects-model-picker-btn')?.addEventListener('click', toggleProjectModelPicker);
  document.addEventListener('click', closeProjectModelPickerOnOutsideClick);
  // Delegated click handling for the Approve/Reject/Approve & continue buttons
  // rendered inside the project history by renderApprovalCardHtml.
  const _history = document.getElementById('projects-history');
  _history?.addEventListener('click', handleApprovalClick);
  // Returning to chat (or starting a new chat) closes the Projects view so the
  // chat-container is revealed again — the existing rail handlers keep working.
  document.getElementById('rail-chats')?.addEventListener('click', closeProjectsView);
  document.getElementById('rail-new-session')?.addEventListener('click', closeProjectsView);
  installProjectsNavigationClose();
  loadProjects();
  loadProjectModels();
  renderProjectEmptyState();
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'same-origin', ...options });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

async function loadProjects() {
  const list = document.getElementById('projects-list');
  if (!list) return;
  const projects = await api('/api/projects').catch(() => []);
  list.innerHTML = projects.map(p => `<button type="button" class="projects-row" data-project-id="${esc(p.id)}"><span>${esc(p.name)}</span><small>${esc(p.folder_name)}</small></button>`).join('') || '<div class="projects-empty">No projects yet</div>';
  list.querySelectorAll('[data-project-id]').forEach(btn => btn.addEventListener('click', () => openProject(btn.dataset.projectId)));
}

async function loadProjectModels() {
  const data = await api('/api/models').catch(() => ({ items: [] }));
  projectModels = flattenProjectModels(data.items);
  renderProjectModelList();
  updateProjectModelPickerLabel(window.__odysseusActiveProject || null);
}

async function createProjectFromPicker() {
  setStatus('');
  try {
    const picked = await pickProjectFolder();
    if (!picked || picked.cancelled) return;
    const project = await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_path: picked.path, ...selectedProjectModelPayload() }),
    });
    await loadProjects();
    await renderProject(project);
  } catch (err) {
    setStatus(err?.message || 'Could not choose a project folder', true);
  }
}

async function openProject(id) {
  await renderProject(await api(`/api/projects/${encodeURIComponent(id)}`));
}

async function renderProject(project) {
  window.__odysseusActiveProject = project;
  updateProjectHero(project);
  const treeEl = document.getElementById('projects-tree');
  if (treeEl) {
    treeEl.innerHTML = renderProjectTreeHtml(project.tree?.entries);
  }
  const histEl = document.getElementById('projects-history');
  if (histEl) {
    histEl.innerHTML = (project.messages || []).map(m => `<div class="message ${esc(m.role)}"><div class="message-content">${esc(m.content)}</div></div>`).join('') || '';
  }
  setProjectsChatEmpty(shouldCenterProjectComposer(project));
  const autoEl = document.getElementById('projects-auto-approve');
  if (autoEl) autoEl.checked = !!project.auto_approve;
  updateProjectModelPickerLabel(project);
  renderChanges([]);
  openProjectsView();
}

function updateProjectHero(project) {
  const state = buildProjectHeroState(project);
  const title = document.getElementById('projects-title');
  const dir = document.getElementById('projects-dir-label');
  const model = document.getElementById('projects-model-label');
  const branch = document.getElementById('projects-branch-label');
  const access = document.getElementById('projects-access-label');
  if (title) title.textContent = state.title;
  if (dir) dir.textContent = state.directory;
  if (model) model.textContent = state.model;
  if (branch) branch.textContent = state.branch;
  if (access) access.textContent = state.access;
}

function selectedProjectModelPayload() {
  const chosen = document.getElementById('projects-model-picker-btn')?.dataset || {};
  return chosen.model ? {
    model: chosen.model,
    endpoint_url: chosen.endpointUrl || '',
    endpoint_id: chosen.endpointId || '',
  } : {};
}

function updateProjectModelPickerLabel(project) {
  const btn = document.getElementById('projects-model-picker-btn');
  const label = document.getElementById('projects-model-picker-label');
  if (!btn || !label) return;
  const model = project?.model || btn.dataset.model || '';
  if (project?.model) {
    btn.dataset.model = project.model;
    btn.dataset.endpointUrl = project.endpoint_url || '';
    btn.dataset.endpointId = project.endpoint_id || '';
  }
  label.textContent = model ? model.split('/').pop() : 'Select model';
}

function renderProjectModelList() {
  const list = document.getElementById('projects-model-picker-list');
  if (!list) return;
  list.innerHTML = projectModels.length ? projectModels.map((m, idx) => `
    <button type="button" class="model-switch-item" data-project-model-idx="${idx}">
      <span class="mp-model-name">${esc(m.displayName.split('/').pop())}</span>
      <span class="model-switch-ep">${esc(m.endpointName)}</span>
    </button>`).join('') : '<div class="model-switch-empty">No models</div>';
  list.querySelectorAll('[data-project-model-idx]').forEach(btn => {
    btn.addEventListener('click', () => selectProjectModel(projectModels[Number(btn.dataset.projectModelIdx)]));
  });
}

function toggleProjectModelPicker(event) {
  event?.stopPropagation?.();
  const menu = document.getElementById('projects-model-picker-menu');
  if (!menu) return;
  if (!projectModels.length) loadProjectModels();
  menu.classList.toggle('hidden');
  menu.classList.toggle('open', !menu.classList.contains('hidden'));
}

function closeProjectModelPicker() {
  const menu = document.getElementById('projects-model-picker-menu');
  menu?.classList.add('hidden');
  menu?.classList.remove('open');
}

function closeProjectModelPickerOnOutsideClick(event) {
  if (event.target?.closest?.('#projects-model-picker-wrap')) return;
  closeProjectModelPicker();
}

async function selectProjectModel(item) {
  if (!item) return;
  const btn = document.getElementById('projects-model-picker-btn');
  if (btn) {
    btn.dataset.model = item.model;
    btn.dataset.endpointUrl = item.endpointUrl || '';
    btn.dataset.endpointId = item.endpointId || '';
  }
  const project = window.__odysseusActiveProject;
  if (project?.id) {
    Object.assign(project, { model: item.model, endpoint_url: item.endpointUrl || '', endpoint_id: item.endpointId || '' });
    await api(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedProjectModelPayload()),
    });
  }
  updateProjectHero(project || { model: item.model });
  updateProjectModelPickerLabel(project || { model: item.model, endpoint_url: item.endpointUrl, endpoint_id: item.endpointId });
  closeProjectModelPicker();
}

// Grow the project composer to fit its content, capped at the CSS max-height.
// Mirrors the main chat composer's auto-resize so multi-line prompts don't
// overflow the single-row textarea.
function autoResizeProjectInput(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function setProjectsChatEmpty(isEmpty) {
  const chat = document.getElementById('projects-view')?.querySelector('.projects-chat');
  if (!chat) return;
  chat.classList.toggle('projects-chat-empty', !!isEmpty);
}

function renderProjectEmptyState() {
  if (window.__odysseusActiveProject) return;
  updateProjectHero(null);
  const histEl = document.getElementById('projects-history');
  if (histEl) histEl.innerHTML = '';
  setProjectsChatEmpty(true);
}

async function sendProjectPrompt(event) {
  event.preventDefault();
  const project = window.__odysseusActiveProject;
  const input = document.getElementById('projects-input');
  const content = input?.value || '';
  const guard = validateProjectSubmission(project, content, projectModels.length > 0);
  if (!guard.ok) {
    if (guard.error) setStatus(guard.error, true);
    return;
  }
  setStatus('');
  if (input) input.value = '';
  autoResizeProjectInput(input);
  setProjectsChatEmpty(false);
  appendProjectMessage('user', content.trim());
  try {
    await api(`/api/projects/${encodeURIComponent(project.id)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.trim() }),
    });
    subscribeProject(project.id);
  } catch (err) {
    setStatus(err?.message || 'Failed to send message', true);
  }
}

/**
 * Turn a named `event: error` SSE MessageEvent (or a plain connection-error
 * Event) into a user-facing status string. Returns null when the event is not
 * an error payload we know how to surface (e.g. a real connection failure,
 * which has no .data) so the caller can fall back to the generic message.
 *
 * Exported for unit tests; the SSE path is hard to exercise in Node without a
 * browser EventSource, so the parsing logic is factored out here.
 */
export function projectStreamErrorMessage(event) {
  if (typeof event?.data !== 'string' || !event.data) return null;
  let payload = null;
  try { payload = JSON.parse(event.data); } catch { return null; }
  if (!payload || typeof payload !== 'object') return null;
  const msg = payload.text || payload.error || (payload.status ? `Error ${payload.status}` : null);
  return msg ? `Project agent error: ${msg}` : null;
}

function subscribeProject(projectId) {
  const es = new EventSource(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/stream`, { withCredentials: true });
  const events = [];
  let streamState = { assistantText: '' };
  let assistantEl = null;
  // Set when we surface a real upstream error event so _signalEmptyFailure
  // doesn't overwrite it with the generic "no response" fallback.
  let sawStreamError = false;
  const _signalEmptyFailure = () => {
    // Stream ended without a single assistant delta or tool event -- surface
    // that as a status instead of leaving the user staring at their own
    // message with no reply (the "input cleared, nothing happened" case).
    if (!sawStreamError && !streamState.assistantText && !events.length) {
      setStatus('No response from the project agent. Check the model and endpoint.', true);
    }
  };
  es.onmessage = (event) => {
    if (event.data === '[DONE]') {
      _signalEmptyFailure();
      es.close();
      return;
    }
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    streamState = reduceProjectStreamState(streamState, data);
    if (streamState.changed) {
      assistantEl = assistantEl || appendProjectMessage('assistant', '');
      const content = assistantEl.querySelector('.message-content');
      if (content) content.textContent = streamState.assistantText;
      scrollProjectsHistory();
    } else if (data.type === 'tool_output') {
      events.push(data);
      renderChanges(events);
    } else if (data.type === 'pending_approval' || data.pending === true) {
      appendApprovalCard(data);
    }
  };
  // EventSource routes a named `event: error` SSE message here as a
  // MessageEvent with .data set to the JSON payload; a real connection
  // failure fires a plain Event with no data. Distinguish the two so we
  // surface the upstream error (status/text) instead of silently
  // discarding it and falling back to the generic "no response" message.
  es.onerror = (event) => {
    const errMsg = projectStreamErrorMessage(event);
    if (errMsg) {
      setStatus(errMsg, true);
      sawStreamError = true;
    }
    _signalEmptyFailure();
    es.close();
  };
}

function appendProjectMessage(role, content) {
  const hist = document.getElementById('projects-history');
  if (!hist) return null;
  const msg = document.createElement('div');
  msg.className = `message ${role}`;
  const body = document.createElement('div');
  body.className = 'message-content';
  body.textContent = content || '';
  msg.appendChild(body);
  hist.appendChild(msg);
  scrollProjectsHistory();
  return msg;
}

function scrollProjectsHistory() {
  const hist = document.getElementById('projects-history');
  if (hist) hist.scrollTop = hist.scrollHeight;
}

function appendApprovalCard(data) {
  const hist = document.getElementById('projects-history');
  if (!hist) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = renderApprovalCardHtml(data);
  hist.appendChild(wrap.firstElementChild);
  scrollProjectsHistory();
}

async function handleApprovalClick(event) {
  const btn = event.target?.closest?.('[data-project-approval]');
  if (!btn) return;
  const card = btn.closest('.projects-approval-card');
  const pendingId = card?.dataset?.pendingId;
  const project = window.__odysseusActiveProject;
  if (!pendingId || !project) return;
  const decision = btn.getAttribute('data-project-approval') === 'reject' ? 'reject' : 'approve';
  if (btn.getAttribute('data-project-approval') === 'approve-continue') {
    const cb = document.getElementById('projects-auto-approve');
    if (cb) { cb.checked = true; project.auto_approve = true; }
    updateProjectHero(project);
  }
  try {
    await api(`/api/projects/${encodeURIComponent(project.id)}/approve/${encodeURIComponent(pendingId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    card?.remove();
  } catch (e) {
    card?.classList.add('projects-approval-failed');
  }
}

function renderChanges(events) {
  const body = document.getElementById('projects-changes-body');
  if (!body) return;
  const stats = summarizeDiffStats(events);
  body.innerHTML = stats.files
    ? `<div class="projects-change-summary">${stats.files} file${stats.files === 1 ? '' : 's'} +${stats.added} -${stats.removed}</div>`
    : '<div class="projects-empty">No changes yet</div>';
}

async function revealActiveProject() {
  const project = window.__odysseusActiveProject;
  if (!project) return;
  if (isDesktopBridgeAvailable(window)) {
    await window.pywebview.api.reveal_in_finder(project.folder_path);
  }
}

async function toggleAutoApprove(event) {
  const project = window.__odysseusActiveProject;
  if (!project) return;
  project.auto_approve = !!event.target?.checked;
  api(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_approve: project.auto_approve }),
  }).catch(() => {});
  updateProjectHero(project);
}

function toggleAccessButton() {
  const cb = document.getElementById('projects-auto-approve');
  if (!cb) return;
  cb.checked = !cb.checked;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
}

function toggleProjectsSidebar() {
  const view = document.getElementById('projects-view');
  const btn = document.getElementById('projects-files-toggle');
  const collapsed = !view?.classList.contains('projects-files-collapsed');
  view?.classList.toggle('projects-files-collapsed', collapsed);
  btn?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  if (btn) btn.title = collapsed ? 'Expand files' : 'Collapse files';
}

export default { initProjectsUI, openProjectsView, closeProjectsView };
