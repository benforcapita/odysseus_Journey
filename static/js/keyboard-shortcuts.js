// ============================================
// Keyboard Shortcuts — dynamic keybinds
// ============================================

import { IS_MAC, isAltGrEvent } from './platform.js';
import * as modalManager from './modalManager.js';
import * as tileManager from './tileManager.js';
import * as modalSnap from './modalSnap.js';
import * as toolWindowZOrder from './toolWindowZOrder.js';

const _defaultKeybinds = {
  search: 'ctrl+k', toggle_sidebar: 'ctrl+alt+b', new_session: 'ctrl+alt+n',
  fav_session: 'ctrl+alt+f', delete_session: 'ctrl+alt+d',
  cancel: 'escape', tts: 'alt+shift+t',
  incognito: 'ctrl+alt+i', settings: 'ctrl+,', focus_input: 'ctrl+/',
  command_palette: 'ctrl+shift+p',
  // Global window-management actions (per-window snap/close/minimize are
  // palette-only — no keybind to avoid collisions). Unbound by default;
  // users can bind them in Settings → Shortcuts.
  win_close_all: 'ctrl+alt+shift+w', win_min_all: 'ctrl+alt+shift+m',
  win_restore_all: 'ctrl+alt+shift+r',
  win_cycle_next: 'ctrl+alt+shift+j', win_cycle_prev: 'ctrl+alt+shift+k',
  // Open-tool shortcuts (Calendar bound by default; rest unbound).
  open_calendar: 'ctrl+alt+c', open_compare: '', open_cookbook: '',
  open_research: '', open_gallery: '', open_library: '', open_memory: '',
  open_notes: '', open_tasks: '', open_theme: '', open_tools: '',
};

export function _matchesCombo(e, combo, isMac = IS_MAC) {
  if (typeof combo !== 'string' || !combo) return false;
  // Drop AltGr keystrokes so typing characters on non-US layouts can't fire a
  // Ctrl+Alt shortcut — e.g. the destructive delete_session. See platform.js.
  if (isAltGrEvent(e, isMac)) return false;
  const parts = combo.split('+');
  const needCtrl = parts.includes('ctrl');
  const needAlt = parts.includes('alt');
  const needShift = parts.includes('shift');
  const key = parts.filter(p => p !== 'ctrl' && p !== 'alt' && p !== 'shift')[0] || '';
  if (needCtrl !== (e.ctrlKey || e.metaKey)) return false;
  if (needAlt !== e.altKey) return false;
  if (needShift !== e.shiftKey) return false;
  return e.key.toLowerCase() === key;
}

/**
 * Initialize keyboard shortcuts.
 * @param {Object} modules - References to app modules and helpers
 * @param {Function} modules.el - Element lookup helper (uiModule.el)
 * @param {Object} modules.Storage - Storage module
 * @param {Object} modules.sessionModule
 * @param {Object} modules.uiModule
 * @param {Object} modules.chatModule
 * @param {Object} modules.adminModule
 * @param {Object} modules.settingsModule
 * @param {Object} modules.searchChatModule
 * @param {Function} modules._closeCompareIfActive
 * @param {Function} modules._deactivateIncognito
 * @param {string} modules.API_BASE
 */
export function initKeyboardShortcuts(modules) {
  const {
    el, Storage, sessionModule, uiModule, chatModule,
    adminModule, settingsModule, searchChatModule,
    commandPaletteModule,
    _closeCompareIfActive, _deactivateIncognito, API_BASE
  } = modules;

  window._odysseusKeybinds = { ..._defaultKeybinds };

  // Load saved keybinds
  fetch('/api/auth/settings', { credentials: 'same-origin' })
    .then(r => r.json())
    .then(s => { if (s.keybinds) window._odysseusKeybinds = { ..._defaultKeybinds, ...s.keybinds }; })
    .catch(() => {});

  // ── Esc cancels select mode (capture phase, before modal-close) ──

  // ── Command palette action dispatcher ──────────────────────────────────
  const _dispatchCommandPalette = (actionId) => {
    // Window-management actions (win:* ids) are generated dynamically and
    // dispatched by the helpers below — short-circuit before tool-button
    // handling so the ids never collide with static tool ids.
    if (_dispatchWindow(actionId)) return;
    const toolBtns = {
      open_calendar: 'tool-calendar-btn',
      open_compare:  'tool-compare-btn',
      open_cookbook: 'tool-cookbook-btn',
      open_research: 'tool-research-btn',
      open_gallery:  'tool-gallery-btn',
      open_library:  'tool-library-btn',
      open_memory:   'tool-memory-btn',
      open_notes:    'tool-notes-btn',
      open_tasks:    'tool-tasks-btn',
      open_theme:    'tool-theme-btn',
      open_tools:    'tool-tools-btn',
      open_email:    'email-section-title',
      open_settings: 'user-bar-settings',
    };
    if (toolBtns[actionId]) {
      const btn = el(toolBtns[actionId]);
      if (btn) { btn.click(); return; }
    }
    if (actionId === 'new_chat') {
      const nb = el('sidebar-new-chat-btn');
      if (nb) { nb.click(); return; }
      if (sessionModule) {
        const sid = sessionModule.getCurrentSessionId();
        const sessions = sessionModule.getSessions();
        const cur = sid ? sessions.find(s => s.id === sid) : null;
        const fd = new FormData();
        fd.append('name', new Date().toLocaleTimeString());
        fd.append('endpoint_url', cur ? cur.endpoint_url || '' : '');
        fd.append('model', cur ? cur.model || '' : '');
        if (cur && cur.endpoint_id) fd.append('endpoint_id', cur.endpoint_id);
        fd.append('skip_validation', 'true');
        fetch(`${API_BASE}/api/session`, { method: 'POST', body: fd, credentials: 'same-origin' })
          .then(r => r.ok ? r.json() : null)
          .then(async data => {
            if (data) {
              await sessionModule.loadSessions();
              await sessionModule.selectSession(data.id);
            }
          });
      }
      return;
    }
    if (actionId === 'search_chats') {
      if (searchChatModule) searchChatModule.openSearch();
      return;
    }
    if (actionId === 'focus_input') {
      const inp = el('message');
      if (inp) inp.focus();
      return;
    }
    if (actionId === 'toggle_sidebar') {
      const sidebar = el('sidebar'); if (sidebar) sidebar.classList.toggle('hidden');
      return;
    }
    if (actionId === 'toggle_incognito') {
      const btn = el('incognito-btn');
      if (btn) btn.click();
      return;
    }
    if (actionId === 'toggle_window') {
      if (typeof _toggleActiveWindow === 'function') _toggleActiveWindow();
      return;
    }
    if (actionId === 'fav_session') {
      const sid = sessionModule && sessionModule.getCurrentSessionId();
      if (!sid) return;
      const s = sessionModule.getSessions().find(x => x.id === sid);
      if (!s) return;
      const newVal = !s.is_important;
      const fd = new FormData();
      fd.append('important', newVal);
      fetch(`${API_BASE}/api/session/${sid}/important`, { method: 'POST', body: fd });
      s.is_important = newVal;
      sessionModule.renderSessionList();
      if (uiModule && uiModule.showToast) uiModule.showToast(newVal ? 'Session favorited' : 'Session unfavorited');
      return;
    }
    if (actionId === 'delete_session') {
      const sid = sessionModule && sessionModule.getCurrentSessionId();
      if (!sid) return;
      const s = sessionModule.getSessions().find(x => x.id === sid);
      if (!s) return;
      if (s.is_important) { if (uiModule && uiModule.showToast) uiModule.showToast('Unstar before deleting'); return; }
      if (uiModule && uiModule.styledConfirm) {
        uiModule.styledConfirm('Delete this session?', { confirmText: 'Delete', danger: true }).then(ok => {
          if (!ok) return;
          const allSessions = sessionModule.getSessions();
          const idx = allSessions.findIndex(x => x.id === sid);
          const nextSession = allSessions.filter(x => !x.archived && x.id !== sid)[Math.max(0, idx)] ||
                              allSessions.find(x => !x.archived && x.id !== sid);
          fetch(`${API_BASE}/api/session/${sid}`, { method: 'DELETE' }).then(async () => {
            await sessionModule.loadSessions();
            if (nextSession) {
              await sessionModule.selectSession(nextSession.id);
            } else {
              sessionModule.setCurrentSessionId(null);
              el('chat-history').innerHTML = '';
              el('current-meta').textContent = 'Odysseus Chat';
              Storage.remove('lastSessionId');
              if (chatModule && chatModule.showWelcomeScreen) chatModule.showWelcomeScreen();
            }
          });
        });
      }
      return;
    }
    if (actionId === 'cancel_generation') {
      if (chatModule) chatModule.abortCurrentRequest();
      return;
    }
    if (actionId === 'tts') {
      var mgr = window.aiTTSManager;
      if (!mgr || !mgr.available) return;
      if (mgr.isPlaying || mgr._processing) { mgr.stop(); return; }
      var allAI = document.querySelectorAll('#chat-history .msg-ai');
      for (var i = allAI.length - 1; i >= 0; i--) {
        var ttsBtn = allAI[i].querySelector('.ai-tts-button');
        if (ttsBtn) { ttsBtn.click(); return; }
      }
      return;
    }
  };
  // Every tool's bulk-select bar has a `*-bulk-cancel` button whose click
  // already runs the correct teardown (clears selection, hides the bar,
  // re-renders). So a single global handler that clicks whichever cancel
  // button is currently visible covers all of them — notes, skills,
  // memory, gallery, sessions, doc library (chats/archive/research/docs),
  // email, cookbook serve — without each module wiring its own listener.
  // Capture phase + stopPropagation so Esc cancels select instead of
  // closing the surrounding modal.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const cancels = document.querySelectorAll('[id$="-bulk-cancel"]');
    for (const btn of cancels) {
      // Do not rely on offsetParent: visible fixed-position or modal-contained
      // controls can report null. Check the rendered box and hidden ancestors.
      const visible = (() => {
        if (btn.disabled || btn.closest('.hidden,[hidden]')) return false;
        const cs = getComputedStyle(btn);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
        return btn.offsetWidth > 0 || btn.offsetHeight > 0 || btn.getClientRects().length > 0;
      })();
      if (visible) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        btn.click();
        return;
      }
    }
  }, true);

  // ── "Toggle Window" — close whatever tool window is open, or reopen the
  // last one. Maps each window's modal element to the button/title that
  // opens it (mirrors modalManager's _AUTO_WIRE, plus email's section title).
  const _WINDOW_TRIGGERS = {
    'settings-modal':         'user-bar-settings',
    'theme-modal':            'tool-theme-btn',
    'tools-modal':            'tool-tools-btn',
    'tasks-modal':            'tool-tasks-btn',
    'notes-panel':            'tool-notes-btn',
    'memory-modal':           'tool-memory-btn',
    'doclib-modal':           'tool-library-btn',
    'gallery-modal':          'tool-gallery-btn',
    'research-overlay':       'tool-research-btn',
    'cookbook-modal':         'tool-cookbook-btn',
    'compare-model-overlay':  'tool-compare-btn',
    'calendar-modal':         'tool-calendar-btn',
    'email-lib-modal':        'email-section-title',
    // No sidebar/rail trigger button, but listing them here lets the
    // command palette surface per-window actions for these too. The close
    // path falls through to the modal's own close button.
    'ge-shortcuts-modal':     '',
    'custom-preset-modal':    '',
  };
  let _lastWindow = 'settings-modal';

  const _windowVisible = (id) => {
    const m = document.getElementById(id);
    if (!m || m.classList.contains('hidden')) return false;
    const cs = getComputedStyle(m);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    return m.offsetWidth > 0 || m.offsetHeight > 0 || m.getClientRects().length > 0;
  };

  const _toggleActiveWindow = () => {
    // Close the first open window (remembering it), else reopen the last one.
    let openId = null;
    for (const id in _WINDOW_TRIGGERS) {
      if (_windowVisible(id)) { openId = id; break; }
    }
    if (openId) {
      _lastWindow = openId;
      const m = document.getElementById(openId);
      const closeBtn = m && m.querySelector('.close-btn, .modal-close, [data-close]');
      if (closeBtn) closeBtn.click();
      else if (openId === 'settings-modal' && settingsModule) settingsModule.close();
      else { const t = el(_WINDOW_TRIGGERS[openId]); if (t) t.click(); }
    } else if (_lastWindow === 'settings-modal') {
      if (settingsModule) settingsModule.open();
    } else {
      const t = el(_WINDOW_TRIGGERS[_lastWindow]);
      if (t) t.click();
      else if (settingsModule) settingsModule.open();
    }
  };

  // ── Window management for the command palette ─────────────────────────
  // Per-window actions are generated dynamically from whichever tool
  // windows are currently open (visible or minimized-to-dock). A command
  // for a closed window is never shown — and would be a no-op if it were.

  // "Sides" are the persistent edge docks (chat reflows around the window);
  // top/bottom/maximize/fullscreen are floating tile-snaps. Every tool
  // window wires makeWindowDraggable with enableDock + enableLeftDock, so
  // both dock sides are always offered. Tile-snaps keep tileManager's
  // per-window layout guards: settings crushes on anything but a dock, and
  // cookbook/theme only tolerate true fullscreen.
  const _DOCK_SIDES = ['left', 'right'];
  const _TILE_ZONES_ALLOWED = {
    'settings-modal':  [],
    'cookbook-modal':  ['fullscreen'],
    'theme-modal':     ['fullscreen'],
  };
  const _DEFAULT_TILE_ZONES = ['top-half', 'bottom-half', 'maximize', 'fullscreen'];
  const _TILE_VERB = {
    'top-half':    'Snap to top half',
    'bottom-half': 'Snap to bottom half',
    'maximize':    'Maximize',
    'fullscreen':  'Fill fullscreen',
  };

  const _isSnappedOrDocked = (modal) => {
    if (!modal) return false;
    if (modal.classList.contains('modal-left-docked') || modal.classList.contains('modal-right-docked')) return true;
    const content = modal.querySelector('.modal-content, .research-pane');
    return !!(content && content.dataset && content.dataset._tileZone);
  };

  // Walk every known tool window and return its current open state.
  const _openWindows = () => {
    const out = [];
    for (const id in _WINDOW_TRIGGERS) {
      const modal = document.getElementById(id);
      if (!modal) continue;
      const visible = _windowVisible(id);
      const minimized = modalManager.isMinimized(id);
      if (!visible && !minimized) continue; // closed → no commands
      out.push({
        id, modal, visible, minimized,
        label: modalManager.labelFor(id),
        snapped: _isSnappedOrDocked(modal),
      });
    }
    return out;
  };

  const _tileLabel = (zone, label) => {
    if (zone === 'maximize')   return 'Maximize ' + label;
    if (zone === 'fullscreen') return 'Fill ' + label + ' fullscreen';
    const verb = _TILE_VERB[zone] || zone;
    // "Snap to top half" → "Snap <Window> to top half"
    return verb.replace('Snap to', 'Snap ' + label + ' to');
  };

  // Build the dynamic command list the palette merges into its results.
  const _buildWindowCommands = () => {
    const kb = window._odysseusKeybinds || _defaultKeybinds;
    const wins = _openWindows();
    const cmds = [];

    // Global actions first (kept gated so they don't show when nothing's open)
    const visibleWins = wins.filter(w => w.visible && !w.minimized);
    const minWins     = wins.filter(w => w.minimized);
    if (wins.length)            cmds.push({ id: 'win:close_all',   label: 'Close all windows',              category: 'Window', shortcut: kb.win_close_all   || '' });
    if (visibleWins.length)     cmds.push({ id: 'win:min_all',     label: 'Minimize all windows to dock',   category: 'Window', shortcut: kb.win_min_all     || '' });
    if (minWins.length)         cmds.push({ id: 'win:restore_all', label: 'Restore all minimized windows',  category: 'Window', shortcut: kb.win_restore_all || '' });
    if (visibleWins.length > 1) {
      cmds.push({ id: 'win:cycle_next', label: 'Cycle to next window',     category: 'Window', shortcut: kb.win_cycle_next || '' });
      cmds.push({ id: 'win:cycle_prev', label: 'Cycle to previous window', category: 'Window', shortcut: kb.win_cycle_prev || '' });
    }

    // Per-window actions — only for windows that are actually open.
    for (const w of wins) {
      if (w.minimized) {
        // A minimized window can only be restored or fully closed.
        cmds.push({ id: 'win:restore:' + w.id, label: 'Restore ' + w.label, category: 'Window' });
        cmds.push({ id: 'win:close:'   + w.id, label: 'Close '   + w.label, category: 'Window' });
        continue;
      }
      cmds.push({ id: 'win:close:' + w.id, label: 'Close '   + w.label,              category: 'Window' });
      cmds.push({ id: 'win:min:'   + w.id, label: 'Minimize ' + w.label + ' to dock', category: 'Window' });
      // Sides → persistent edge dock (chat reflows around the window).
      for (const side of _DOCK_SIDES) {
        cmds.push({ id: 'win:dock:' + side + ':' + w.id, label: 'Dock ' + w.label + ' to ' + side, category: 'Window' });
      }
      // Top/bottom/maximize/fullscreen → floating tile-snap, gated per window.
      const tileZones = _TILE_ZONES_ALLOWED[w.id] || _DEFAULT_TILE_ZONES;
      for (const zone of tileZones) {
        cmds.push({ id: 'win:snap:' + zone + ':' + w.id, label: _tileLabel(zone, w.label), category: 'Window' });
      }
      if (w.snapped) {
        cmds.push({ id: 'win:unsnap:' + w.id, label: 'Undock ' + w.label, category: 'Window' });
      }
    }
    return cmds;
  };

  // Close a single window whether or not it's been registered with
  // modalManager (auto-register only happens on minimize, so a freshly-
  // opened visible tool usually isn't registered yet).
  const _closeWindow = (id) => {
    if (modalManager.isRegistered(id)) {
      try { modalManager.close(id); return; } catch (e) { /* fall through */ }
    }
    const m = document.getElementById(id);
    if (m) {
      const closeBtn = m.querySelector('.close-btn, .modal-close, [data-close]');
      if (closeBtn) { closeBtn.click(); return; }
    }
    const trig = el(_WINDOW_TRIGGERS[id]);
    if (trig) trig.click();
    else if (id === 'settings-modal' && settingsModule) settingsModule.close();
  };

  const _closeAllWindows = () => {
    for (const w of _openWindows()) _closeWindow(w.id);
  };
  const _minimizeAllWindows = () => {
    for (const w of _openWindows()) {
      if (w.visible && !w.minimized) { try { modalManager.minimize(w.id); } catch (e) {} }
    }
  };
  const _restoreAllWindows = () => {
    for (const w of _openWindows()) {
      if (w.minimized) { try { modalManager.restore(w.id); } catch (e) {} }
    }
  };

  // Rotate focus through the open window stack by z-index. "next" brings
  // the second-from-top to the front (top drops one); "prev" brings the
  // bottommost to the front. For two windows both bring the other up.
  const _cycleWindow = (dir) => {
    const wins = _openWindows().filter(w => w.visible && !w.minimized && w.modal);
    if (wins.length < 2) return;
    const zOf = (m) => parseInt(getComputedStyle(m).zIndex || '0', 10) || 0;
    wins.sort((a, b) => zOf(a.modal) - zOf(b.modal));
    const target = (dir === 'next') ? wins[wins.length - 2] : wins[0];
    if (!target) return;
    const newZ = toolWindowZOrder.nextToolWindowZ({ current: String(zOf(target.modal)) });
    target.modal.style.zIndex = String(newZ);
    const f = target.modal.querySelector('[tabindex], button, input, textarea, select');
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) {} }
    else if (uiModule && uiModule.showToast) {
      uiModule.showToast(target.label + ' brought to front');
    }
  };

  // Dispatch a `win:*` action id. Returns true if handled.
  const _dispatchWindow = (actionId) => {
    if (!actionId || actionId.indexOf('win:') !== 0) return false;
    const parts = actionId.split(':');
    const kind = parts[1];
    switch (kind) {
      case 'close_all':    _closeAllWindows();    return true;
      case 'min_all':      _minimizeAllWindows(); return true;
      case 'restore_all':  _restoreAllWindows();  return true;
      case 'cycle_next':   _cycleWindow('next');  return true;
      case 'cycle_prev':   _cycleWindow('prev');  return true;
      case 'dock': {
        // win:dock:<side>:<id> — persistent edge dock. Clear any active
        // tile-snap first so applyEdgeDock snapshots the floating rect,
        // not the tiled one.
        const side = parts[2];
        const dockId = parts[3];
        const m = document.getElementById(dockId);
        if (m) {
          const content = m.querySelector('.modal-content, .research-pane') || m;
          try { tileManager.unsnap(content); } catch (e) {}
          try { modalSnap.applyEdgeDock(m, side); } catch (e) {}
        }
        return true;
      }
      case 'snap': {
        const zone = parts[2];
        const snapId = parts[3];
        const m = document.getElementById(snapId);
        if (m) {
          const z = tileManager.zoneForName(zone);
          if (z) { try { tileManager.snapModalToZone(m, z); } catch (e) {} }
        }
        return true;
      }
      case 'close':   _closeWindow(parts[2]);                          return true;
      case 'min':     try { modalManager.minimize(parts[2]); } catch (e) {} return true;
      case 'restore': try { modalManager.restore(parts[2]); } catch (e) {} return true;
      case 'unsnap': {
        const m = document.getElementById(parts[2]);
        if (m) {
          const content = m.querySelector('.modal-content, .research-pane') || m;
          try { tileManager.unsnap(content); } catch (e) {}
          if (m.classList.contains('modal-left-docked') || m.classList.contains('modal-right-docked')) {
            try { modalSnap.clearRightDock(m); } catch (e) {}
          }
        }
        return true;
      }
      default: return false;
    }
  };

  // Register the dynamic command provider so the palette surfaces these.
  if (commandPaletteModule && commandPaletteModule.setDynamicCommands) {
    commandPaletteModule.setDynamicCommands(_buildWindowCommands);
  }

  document.addEventListener('keydown', (e) => {
    const kb = window._odysseusKeybinds;

    if (_matchesCombo(e, kb.search)) {
      e.preventDefault();
      if (searchChatModule) {
        searchChatModule.isOpen() ? searchChatModule.closeSearch() : searchChatModule.openSearch();
      }
      return;
    }
    if (_matchesCombo(e, kb.toggle_sidebar)) {
      e.preventDefault();
      var sb = document.getElementById('sidebar');
      var ir = document.getElementById('icon-rail');
      if (sb && !sb.classList.contains('hidden')) {
        sb.classList.add('hidden');
      } else {
        if (ir) ir.classList.remove('rail-hidden');
        if (sb) sb.classList.remove('hidden');
      }
      if (typeof syncRailSide === 'function') syncRailSide();
      return;
    }
    if (_matchesCombo(e, kb.tts)) {
      e.preventDefault();
      var mgr = window.aiTTSManager;
      if (!mgr || !mgr.available) return;
      if (mgr.isPlaying || mgr._processing) { mgr.stop(); return; }
      var allAI = document.querySelectorAll('#chat-history .msg-ai');
      for (var i = allAI.length - 1; i >= 0; i--) {
        var ttsBtn = allAI[i].querySelector('.ai-tts-button');
        if (ttsBtn) { ttsBtn.click(); return; }
      }
      return;
    }
    if (_matchesCombo(e, kb.fav_session)) {
      e.preventDefault();
      const sid = sessionModule && sessionModule.getCurrentSessionId();
      if (!sid) return;
      const s = sessionModule.getSessions().find(x => x.id === sid);
      if (!s) return;
      const newVal = !s.is_important;
      const fd = new FormData();
      fd.append('important', newVal);
      fetch(`${API_BASE}/api/session/${sid}/important`, { method: 'POST', body: fd });
      s.is_important = newVal;
      sessionModule.renderSessionList();
      uiModule.showToast(newVal ? 'Session favorited' : 'Session unfavorited');
      return;
    }
    if (_matchesCombo(e, kb.delete_session)) {
      e.preventDefault();
      const sid = sessionModule && sessionModule.getCurrentSessionId();
      if (!sid) return;
      const s = sessionModule.getSessions().find(x => x.id === sid);
      if (!s) return;
      if (s.is_important) { uiModule.showToast('Unstar before deleting'); return; }
      uiModule.styledConfirm('Delete this session?', { confirmText: 'Delete', danger: true }).then(ok => {
        if (!ok) return;
        const allSessions = sessionModule.getSessions();
        const idx = allSessions.findIndex(x => x.id === sid);
        const nextSession = allSessions.filter(x => !x.archived && x.id !== sid)[Math.max(0, idx)] ||
                            allSessions.find(x => !x.archived && x.id !== sid);
        fetch(`${API_BASE}/api/session/${sid}`, { method: 'DELETE' }).then(async () => {
          await sessionModule.loadSessions();
          if (nextSession) {
            await sessionModule.selectSession(nextSession.id);
          } else {
            sessionModule.setCurrentSessionId(null);
            el('chat-history').innerHTML = '';
            el('current-meta').textContent = 'Odysseus Chat';
            Storage.remove('lastSessionId');
            if (chatModule && chatModule.showWelcomeScreen) chatModule.showWelcomeScreen();
          }
        });
      });
      return;
    }
    if (_matchesCombo(e, kb.new_session)) {
      e.preventDefault();
      if (_closeCompareIfActive()) return;
      _deactivateIncognito();
      const sid = sessionModule && sessionModule.getCurrentSessionId();
      const sessions = sessionModule ? sessionModule.getSessions() : [];
      const cur = sessions.find(s => s.id === sid);
      const name = new Date().toLocaleTimeString();
      const fd = new FormData();
      fd.append('name', name);
      fd.append('endpoint_url', cur ? cur.endpoint_url || '' : '');
      fd.append('model', cur ? cur.model || '' : '');
      if (cur && cur.endpoint_id) fd.append('endpoint_id', cur.endpoint_id);
      fd.append('skip_validation', 'true');
      fetch(`${API_BASE}/api/session`, { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(r => r.ok ? r.json() : null)
        .then(async data => {
          if (data) {
            await sessionModule.loadSessions();
            await sessionModule.selectSession(data.id);
          }
        });
      return;
    }
    if (_matchesCombo(e, kb.cancel)) {
      if (chatModule) chatModule.abortCurrentRequest();
    }
    if (_matchesCombo(e, kb.incognito)) {
      e.preventDefault();
      // Drive the visible button so the real toggle logic runs (visual
      // state, welcome-screen guard, checkbox sync) — flipping the hidden
      // checkbox alone did nothing.
      const btn = el('incognito-btn');
      if (btn) btn.click();
      return;
    }
    if (_matchesCombo(e, kb.settings)) {
      e.preventDefault();
      _toggleActiveWindow();
      return;
    }
    // Global window-management keybinds. Per-window snap/close/minimize are
    // palette-only; these five operate on the whole open-window stack.
    if (_matchesCombo(e, kb.win_close_all)) {
      e.preventDefault();
      _closeAllWindows();
      return;
    }
    if (_matchesCombo(e, kb.win_min_all)) {
      e.preventDefault();
      _minimizeAllWindows();
      return;
    }
    if (_matchesCombo(e, kb.win_restore_all)) {
      e.preventDefault();
      _restoreAllWindows();
      return;
    }
    if (_matchesCombo(e, kb.win_cycle_next)) {
      e.preventDefault();
      _cycleWindow('next');
      return;
    }
    if (_matchesCombo(e, kb.win_cycle_prev)) {
      e.preventDefault();
      _cycleWindow('prev');
      return;
    }
    // Open-tool shortcuts — click the sidebar tool button so each tool's
    // own open/toggle logic runs. Unbound (empty) combos never match.
    const _toolBtns = {
      open_calendar: 'tool-calendar-btn',
      open_compare:  'tool-compare-btn',
      open_cookbook: 'tool-cookbook-btn',
      open_research: 'tool-research-btn',
      open_gallery:  'tool-gallery-btn',
      open_library:  'tool-library-btn',
      open_memory:   'tool-memory-btn',
      open_notes:    'tool-notes-btn',
      open_tasks:    'tool-tasks-btn',
      open_theme:    'tool-theme-btn',
    };
    for (const action in _toolBtns) {
      if (_matchesCombo(e, kb[action])) {
        e.preventDefault();
        const b = el(_toolBtns[action]);
        if (b) b.click();
        return;
      }
    }
    if (_matchesCombo(e, kb.command_palette)) {
      e.preventDefault();
      if (commandPaletteModule) {
        if (commandPaletteModule.isOpen()) {
          commandPaletteModule.close();
        } else {
          commandPaletteModule.open(_dispatchCommandPalette);
        }
      }
      return;
    }
    if (_matchesCombo(e, kb.focus_input)) {
      e.preventDefault();
      const inp = el('message');
      if (inp) inp.focus();
      return;
    }
  });
}
