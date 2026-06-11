// ============================================
// Command Palette — Cmd/Ctrl+Shift+P quick launcher
// Obsidian-style command palette for fast tool access and actions.
// ============================================

import { IS_MAC } from './platform.js';

const PALETTE_ID = 'cmd-palette-overlay';
const INPUT_ID = 'cmd-palette-input';
const RESULTS_ID = 'cmd-palette-results';
const MAX_VISIBLE = 24;

let _selectedIdx = 0;
let _items = [];
let _filtered = [];
let _visible = false;
let _onSelect = null;  // external callback: (actionId) => void

// ── Command registry ─────────────────────────────────────────────────────

const COMMANDS = [
  // —— Chat ————————————————————————————————————————————————
  { id: 'new_chat',       label: 'New chat',              shortcut: 'Ctrl+Alt+N',   category: 'Chat' },
  { id: 'search_chats',   label: 'Search conversations',  shortcut: 'Ctrl+K',       category: 'Chat' },
  { id: 'focus_input',    label: 'Focus chat input',      shortcut: 'Ctrl+/',       category: 'Chat' },
  { id: 'toggle_sidebar', label: 'Toggle sidebar',        shortcut: 'Ctrl+Alt+B',   category: 'Chat' },
  { id: 'toggle_incognito', label: 'Toggle incognito mode', shortcut: 'Ctrl+Alt+I', category: 'Chat' },
  { id: 'toggle_window',  label: 'Toggle active window',  shortcut: '',             category: 'Chat' },
  { id: 'fav_session',    label: 'Favorite this session', shortcut: 'Ctrl+Alt+F',   category: 'Chat' },
  { id: 'delete_session', label: 'Delete current session',shortcut: 'Ctrl+Alt+D',   category: 'Chat' },
  { id: 'cancel_generation', label: 'Cancel AI generation', shortcut: 'Escape',     category: 'Chat' },
  { id: 'tts',            label: 'Read aloud (TTS)',      shortcut: 'Alt+Shift+T',  category: 'Chat' },

  // —— Tools ———————————————————————————————————————————————
  { id: 'open_calendar',  label: 'Calendar',              shortcut: 'Ctrl+Alt+C',   category: 'Tools' },
  { id: 'open_notes',     label: 'Notes',                 shortcut: '',             category: 'Tools' },
  { id: 'open_tasks',     label: 'Tasks',                 shortcut: '',             category: 'Tools' },
  { id: 'open_memory',    label: 'Memory',                shortcut: '',             category: 'Tools' },
  { id: 'open_library',   label: 'Document library',      shortcut: '',             category: 'Tools' },
  { id: 'open_gallery',   label: 'Gallery',               shortcut: '',             category: 'Tools' },
  { id: 'open_cookbook',  label: 'Cookbook',              shortcut: '',             category: 'Tools' },
  { id: 'open_compare',   label: 'Compare models',        shortcut: '',             category: 'Tools' },
  { id: 'open_research',  label: 'Research',              shortcut: '',             category: 'Tools' },
  { id: 'open_email',     label: 'Email',                 shortcut: '',             category: 'Tools' },
  { id: 'open_theme',     label: 'Theme',                 shortcut: '',             category: 'Tools' },
  { id: 'open_tools',     label: 'Tools Hub',             shortcut: '',             category: 'Tools' },
  { id: 'open_settings',  label: 'Settings',              shortcut: 'Ctrl+,',       category: 'Tools' },
];

// ── Format shortcut for display ──────────────────────────────────────────
function _fmtShortcut(raw) {
  if (!raw) return '';
  return raw
    .replace(/ctrl/i, IS_MAC ? '\u2318' : 'Ctrl')
    .replace(/shift/i, '\u21E7')
    .replace(/alt/i, IS_MAC ? '\u2325' : 'Alt')
    .replace(/escape/i, 'Esc')
    .replace(/\+/g, '');
}

// ── DOM helpers ──────────────────────────────────────────────────────────
function _el(id) { return document.getElementById(id); }

function _ensureOverlay() {
  let overlay = _el(PALETTE_ID);
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = PALETTE_ID;
  overlay.className = 'cmd-palette-overlay hidden';
  overlay.innerHTML = `
    <div class="cmd-palette-popup">
      <input type="text" id="${INPUT_ID}" class="cmd-palette-input"
             placeholder="Type a command…" autocomplete="off" spellcheck="false" />
      <div class="cmd-palette-results" id="${RESULTS_ID}"></div>
      <div class="cmd-palette-footer">
        <span><kbd>\u2191\u2193</kbd> navigate</span>
        <span><kbd>\u21A9</kbd> select</span>
        <span><kbd>Esc</kbd> close</span>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function _esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}

// ── Filtering ────────────────────────────────────────────────────────────
function _score(item, query) {
  const q = query.toLowerCase();
  const l = item.label.toLowerCase();
  if (l === q) return 1000;
  if (l.startsWith(q)) return 500 + (50 - Math.min(50, l.length - q.length));
  if (l.includes(q)) return 200;
  if (item.category.toLowerCase().includes(q)) return 50;
  if (item.shortcut && item.shortcut.toLowerCase().includes(q)) return 30;
  // Match individual words (e.g. "new" matches "New chat")
  const words = l.split(/\s+/);
  for (const w of words) {
    if (w === q) return 300;
    if (w.startsWith(q)) return 150;
  }
  return 0;
}

function _filter(query) {
  if (!query.trim()) return COMMANDS.slice(0, MAX_VISIBLE);
  const q = query.trim();
  return COMMANDS
    .map(c => ({ cmd: c, score: _score(c, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_VISIBLE)
    .map(x => x.cmd);
}

// ── Rendering ────────────────────────────────────────────────────────────
function _render(items) {
  const container = _el(RESULTS_ID);
  if (!container) return;

  if (!items.length) {
    const inp = _el(INPUT_ID);
    const q = inp ? inp.value.trim() : '';
    container.innerHTML = `<div class="cmd-palette-empty">No matching commands for <code>${_esc(q)}</code></div>`;
    return;
  }

  let html = '';
  let lastCat = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.category !== lastCat) {
      html += `<div class="cmd-palette-cat">${_esc(it.category)}</div>`;
      lastCat = it.category;
    }
    const sel = i === _selectedIdx ? ' cmd-palette-row-sel' : '';
    const sc = _fmtShortcut(it.shortcut);
    html += `<div class="cmd-palette-row${sel}" data-idx="${i}" data-id="${_esc(it.id)}">
      <span class="cmd-palette-label">${_esc(it.label)}</span>
      ${sc ? `<span class="cmd-palette-shortcut">${_esc(sc)}</span>` : ''}
    </div>`;
  }
  container.innerHTML = html;

  // Scroll selected into view
  const selEl = container.querySelector('.cmd-palette-row-sel');
  if (selEl) selEl.scrollIntoView({ block: 'nearest' });
}

// ── Position ─────────────────────────────────────────────────────────────
function _position() {
  const popup = _el(PALETTE_ID)?.querySelector('.cmd-palette-popup');
  if (!popup) return;
  // Center horizontally, fixed top offset
  popup.style.marginTop = Math.max(80, window.innerHeight * 0.12) + 'px';
}

// ── Open / Close ─────────────────────────────────────────────────────────
export function open(onSelect) {
  _onSelect = onSelect || null;
  const overlay = _ensureOverlay();
  overlay.classList.remove('hidden');
  _visible = true;
  _items = COMMANDS.slice();
  _selectedIdx = 0;

  const inp = _el(INPUT_ID);
  if (inp) {
    inp.value = '';
    // Small delay so the overlay is visible before focusing (avoids
    // the first keystroke landing in a hidden input on some browsers).
    setTimeout(() => inp.focus(), 50);
  }

  _filtered = _filter('');
  _render(_filtered);
  _position();

  // Listen for resize
  window.addEventListener('resize', _position);
}

export function close() {
  if (!_visible) return;
  _visible = false;
  const overlay = _el(PALETTE_ID);
  if (overlay) overlay.classList.add('hidden');
  _onSelect = null;
  window.removeEventListener('resize', _position);
}

export function isOpen() {
  return _visible;
}

// ── Init ─────────────────────────────────────────────────────────────────
export function init() {
  _ensureOverlay();

  const overlay = _el(PALETTE_ID);
  if (!overlay) return;

  // Close on overlay click (clicked the dark backdrop, not the popup)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const inp = _el(INPUT_ID);
  if (!inp) return;

  inp.addEventListener('input', () => {
    const q = inp.value;
    _filtered = _filter(q);
    _selectedIdx = 0;
    _render(_filtered);
  });

  inp.addEventListener('keydown', (e) => {
    if (!_visible) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (_filtered.length > 0) {
        _selectedIdx = (_selectedIdx + 1) % _filtered.length;
        _render(_filtered);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (_filtered.length > 0) {
        _selectedIdx = (_selectedIdx - 1 + _filtered.length) % _filtered.length;
        _render(_filtered);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_filtered.length > 0 && _selectedIdx >= 0 && _selectedIdx < _filtered.length) {
        const cmd = _filtered[_selectedIdx];
        if (_onSelect) _onSelect(cmd.id);
        close();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  // Click handler on results (delegated)
  const results = _el(RESULTS_ID);
  if (results) {
    results.addEventListener('mousedown', (e) => {
      const row = e.target.closest?.('.cmd-palette-row');
      if (row) {
        e.preventDefault();
        const id = row.dataset.id;
        if (id && _onSelect) _onSelect(id);
        close();
      }
    });
  }
}

const commandPaletteModule = { init, open, close, isOpen };
export default commandPaletteModule;
