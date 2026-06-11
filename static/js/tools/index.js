/**
 * Tools Hub — search-first browser with category filters, favorites, and recents.
 *
 * Lazy-loads tool view modules and renders them inside the shared workspace shell.
 * Fully functional without an AI endpoint.
 */

import { createWorkspace, setExecutionStatus } from './workspace.js';

/**
 * @typedef {object} ToolEntry
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {string} description
 * @property {string[]} keywords
 * @property {string} entrypoint
 * @property {string[]} execution_modes
 * @property {string[]} capabilities
 * @property {string} icon
 */

/**
 * Initialize the Tools Hub inside a container element.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.container - Target DOM element.
 * @param {typeof fetch} [opts.fetchImpl] - fetch override for tests.
 * @param {function} [opts.onOpenTool] - Called when a tool is opened: (toolId, element).
 * @returns {Promise<object>} Hub API: { search, openTool, refresh }.
 */
export async function initToolsHub({ container, fetchImpl = fetch, onOpenTool }) {
  // State
  /** @type {ToolEntry[]} */
  let tools = [];
  let favorites = new Set();
  /** @type {string[]} recents tool IDs, newest first */
  let recents = [];
  let activeToolId = null;

  // ── DOM ──────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.className = 'tools-hub';

  // Search bar
  const searchBar = document.createElement('div');
  searchBar.className = 'tools-hub-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search tools...';
  searchInput.setAttribute('aria-label', 'Search tools by name, description, or keyword');
  searchBar.appendChild(searchInput);
  root.appendChild(searchBar);

  // Category filters
  const filterBar = document.createElement('div');
  filterBar.className = 'tools-hub-filters';
  root.appendChild(filterBar);

  // Tool list
  const listContainer = document.createElement('div');
  listContainer.className = 'tools-hub-list';
  root.appendChild(listContainer);

  // Workspace area
  const workspaceArea = document.createElement('div');
  workspaceArea.className = 'tools-hub-workspace';
  root.appendChild(workspaceArea);

  // ── Data loading ────────────────────────────────────────────────
  async function loadTools() {
    const resp = await fetchImpl('/api/tools');
    if (!resp.ok) throw new Error('Failed to load tools');
    tools = await resp.json();
  }

  async function loadFavorites() {
    try {
      const resp = await fetchImpl('/api/prefs/tools_favorites');
      if (resp.ok) {
        const data = await resp.json();
        favorites = new Set(data.favorites || []);
      }
    } catch {
      // Favorites not available yet — start empty
    }
  }

  async function loadRecents() {
    try {
      const resp = await fetchImpl('/api/tools/runs?limit=20');
      if (resp.ok) {
        const runs = await resp.json();
        const seen = new Set();
        recents = [];
        for (const run of runs) {
          if (!seen.has(run.tool_id)) {
            seen.add(run.tool_id);
            recents.push(run.tool_id);
          }
        }
      }
    } catch {
      recents = [];
    }
  }

  // ── Rendering ──────────────────────────────────────────────────
  function getFilteredTools(query) {
    const q = (query || '').toLowerCase().trim();
    let filtered = tools;

    if (q) {
      filtered = tools.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.keywords || []).some(kw => kw.toLowerCase().includes(q))
      );
    }

    // Sort: favorites first, then recents, then alphabetical
    const scored = filtered.map(t => {
      let score = 0;
      if (favorites.has(t.id)) score += 100;
      const recentIdx = recents.indexOf(t.id);
      if (recentIdx >= 0) score += 50 - recentIdx;
      return { tool: t, score };
    });
    scored.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
    return scored.map(s => s.tool);
  }

  function renderToolList(filtered) {
    listContainer.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tools-hub-empty';
      empty.textContent = 'No tools found.';
      listContainer.appendChild(empty);
      return;
    }

    for (const tool of filtered) {
      const card = document.createElement('div');
      card.className = 'tools-hub-card';
      card.setAttribute('data-tool-id', tool.id);
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Open ${tool.name}`);

      const icon = document.createElement('span');
      icon.className = 'tools-hub-card-icon';
      icon.textContent = tool.icon || '🔧';
      card.appendChild(icon);

      const info = document.createElement('div');
      info.className = 'tools-hub-card-info';

      const name = document.createElement('div');
      name.className = 'tools-hub-card-name';
      name.textContent = tool.name;
      info.appendChild(name);

      const cat = document.createElement('div');
      cat.className = 'tools-hub-card-category';
      cat.textContent = tool.category;
      info.appendChild(cat);

      card.appendChild(info);

      // Favorite toggle
      const favBtn = document.createElement('button');
      favBtn.className = `tools-hub-fav-btn ${favorites.has(tool.id) ? 'is-favorite' : ''}`;
      favBtn.setAttribute('aria-pressed', favorites.has(tool.id) ? 'true' : 'false');
      favBtn.setAttribute('aria-label', favorites.has(tool.id) ? `Remove ${tool.name} from favorites` : `Add ${tool.name} to favorites`);
      favBtn.textContent = favorites.has(tool.id) ? '★' : '☆';
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(tool.id, favBtn);
      });
      card.appendChild(favBtn);

      card.addEventListener('click', () => openTool(tool));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openTool(tool);
        }
      });

      listContainer.appendChild(card);
    }
  }

  function renderCategories() {
    const categories = [...new Set(tools.map(t => t.category))].sort();
    filterBar.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'tools-hub-cat-btn active';
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', () => {
      filterBar.querySelectorAll('.tools-hub-cat-btn').forEach(b => b.classList.remove('active'));
      allBtn.classList.add('active');
      renderToolList(getFilteredTools(searchInput.value));
    });
    filterBar.appendChild(allBtn);

    for (const cat of categories) {
      const btn = document.createElement('button');
      btn.className = 'tools-hub-cat-btn';
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        filterBar.querySelectorAll('.tools-hub-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const q = searchInput.value.toLowerCase().trim();
        let filtered = tools.filter(t => t.category === cat);
        if (q) {
          filtered = filtered.filter(t =>
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            (t.keywords || []).some(kw => kw.toLowerCase().includes(q))
          );
        }
        renderToolList(filtered);
      });
      filterBar.appendChild(btn);
    }
  }

  // ── Actions ─────────────────────────────────────────────────────
  async function openTool(tool) {
    activeToolId = tool.id;
    workspaceArea.innerHTML = '';

    // Loading state
    const loading = document.createElement('div');
    loading.className = 'tools-hub-loading';
    loading.textContent = `Loading ${tool.name}...`;
    workspaceArea.appendChild(loading);

    try {
      const mod = await import(tool.entrypoint);
      const content = await mod.render({
        fetchImpl,
        onStatusChange: (msg, state) => {
          const workspace = workspaceArea.querySelector('.tool-workspace');
          if (workspace) setExecutionStatus(workspace, msg, state);
        },
      });

      workspaceArea.innerHTML = '';
      const workspace = createWorkspace({
        toolId: tool.id,
        toolName: tool.name,
        toolDescription: tool.description,
        capabilities: tool.capabilities || [],
        content,
      });
      workspaceArea.appendChild(workspace);

      if (onOpenTool) onOpenTool(tool.id, workspace);
    } catch (err) {
      workspaceArea.innerHTML = '';
      const error = document.createElement('div');
      error.className = 'tools-hub-error';
      error.textContent = `Could not load ${tool.name}: ${err.message}`;
      error.setAttribute('role', 'alert');
      workspaceArea.appendChild(error);
    }
  }

  async function toggleFavorite(toolId, favBtn) {
    if (favorites.has(toolId)) {
      favorites.delete(toolId);
      favBtn.textContent = '☆';
      favBtn.classList.remove('is-favorite');
      favBtn.setAttribute('aria-pressed', 'false');
    } else {
      favorites.add(toolId);
      favBtn.textContent = '★';
      favBtn.classList.add('is-favorite');
      favBtn.setAttribute('aria-pressed', 'true');
    }

    // Persist
    try {
      await fetchImpl('/api/prefs/tools_favorites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorites: [...favorites] }),
      });
    } catch {
      // Non-fatal — revert on next load
    }

    // Re-render
    renderToolList(getFilteredTools(searchInput.value));
  }

  // ── Search input ────────────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    renderToolList(getFilteredTools(searchInput.value));
  });

  // ── Init ────────────────────────────────────────────────────────
  await Promise.all([loadTools(), loadFavorites(), loadRecents()]);
  renderCategories();
  renderToolList(getFilteredTools(''));
  container.appendChild(root);

  return {
    search: (query) => {
      searchInput.value = query;
      renderToolList(getFilteredTools(query));
    },
    openTool: async (toolId) => {
      const tool = tools.find(t => t.id === toolId);
      if (tool) await openTool(tool);
    },
    refresh: async () => {
      await Promise.all([loadTools(), loadFavorites(), loadRecents()]);
      renderCategories();
      renderToolList(getFilteredTools(searchInput.value));
    },
  };
}
