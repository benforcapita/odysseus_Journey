// Sidebar-native Projects UI controller.
//
// Projects is a macOS-desktop-only surface: it needs a real filesystem path and
// shell access the browser cannot provide, so the rail button is hidden unless
// window.pywebview.api is present. The routes return 503 in browser mode, so an
// accidental request can't partially succeed. Pure helpers (isDesktopBridgeAvailable,
// summarizeDiffStats) are exported for Node testing and avoid touching browser
// globals at import time.

const API_BASE = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';

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
  document.getElementById('projects-reveal-btn')?.addEventListener('click', revealActiveProject);
  // Composer affordance: quick-access icon that reveals the active project's
  // working directory in Finder. Reuses the existing revealActiveProject
  // helper — no new logic, just a second entry point from the chat composer.
  document.getElementById('projects-compose-reveal')?.addEventListener('click', revealActiveProject);
  document.getElementById('projects-auto-approve')?.addEventListener('change', toggleAutoApprove);
  document.getElementById('projects-access-btn')?.addEventListener('click', toggleAccessButton);
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

async function createProjectFromPicker() {
  setStatus('');
  try {
    const picked = await pickProjectFolder();
    if (!picked || picked.cancelled) return;
    const project = await api('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_path: picked.path }),
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
  setProjectsChatEmpty(false);
  updateProjectHero(project);
  const treeEl = document.getElementById('projects-tree');
  if (treeEl) {
    treeEl.innerHTML = renderProjectTreeHtml(project.tree?.entries);
  }
  const histEl = document.getElementById('projects-history');
  if (histEl) {
    histEl.innerHTML = (project.messages || []).map(m => `<div class="message ${esc(m.role)}"><div class="message-content">${esc(m.content)}</div></div>`).join('') || '';
  }
  const autoEl = document.getElementById('projects-auto-approve');
  if (autoEl) autoEl.checked = !!project.auto_approve;
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
  const content = (input?.value || '').trim();
  if (!project || !content) return;
  if (input) input.value = '';
  await api(`/api/projects/${encodeURIComponent(project.id)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  subscribeProject(project.id);
}

function subscribeProject(projectId) {
  const es = new EventSource(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/stream`, { withCredentials: true });
  const events = [];
  es.onmessage = (event) => {
    if (event.data === '[DONE]') {
      es.close();
      return;
    }
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data.type === 'tool_output') {
      events.push(data);
      renderChanges(events);
    } else if (data.type === 'pending_approval' || data.pending === true) {
      appendApprovalCard(data);
    }
  };
  es.onerror = () => { es.close(); };
}

function appendApprovalCard(data) {
  const hist = document.getElementById('projects-history');
  if (!hist) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = renderApprovalCardHtml(data);
  hist.appendChild(wrap.firstElementChild);
  hist.scrollTop = hist.scrollHeight;
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
  // Optimistic local toggle; persistence is wired in a later task.
  project.auto_approve = !!event.target?.checked;
  updateProjectHero(project);
}

function toggleAccessButton() {
  const cb = document.getElementById('projects-auto-approve');
  if (!cb) return;
  cb.checked = !cb.checked;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
}

export default { initProjectsUI, openProjectsView, closeProjectsView };
