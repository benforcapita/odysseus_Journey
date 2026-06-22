// ============================================
// Section Management — collapse/expand + drag reorder
// ============================================

/**
 * Initialize section collapse/expand with chevron buttons.
 * @param {Object} Storage - Storage module
 */
export function initSectionCollapse(Storage) {
  const _chevronHtml = '<button type="button" class="section-collapse-btn" title="Collapse section"><svg class="section-collapse-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>';
  const savedState = Storage.getJSON('section-collapsed') || {};

  document.querySelectorAll('.section .section-header-flex').forEach(header => {
    const section = header.closest('.section');
    if (!section || !section.id) return;

    // Skip email section — it doesn't collapse (title opens popup instead)
    if (section.id === 'email-section') return;

    // Add chevron (always visible — rotates when collapsed)
    header.insertAdjacentHTML('beforeend', _chevronHtml);

    // Restore saved state
    if (savedState[section.id]) {
      section.classList.add('collapsed');
    }

    function toggleCollapse() {
      const wasCollapsed = section.classList.contains('collapsed');
      const willCollapse = !wasCollapsed;
      const state = Storage.getJSON('section-collapsed') || {};
      state[section.id] = willCollapse;
      Storage.setJSON('section-collapsed', state);

      // Always clear any in-flight animation classes from a previous toggle
      // so back-to-back clicks restart cleanly. Bump a generation token so
      // any callback still pending from a superseded toggle becomes a no-op.
      section.classList.remove('section-just-expanded', 'section-just-collapsing');
      const gen = (section._collapseGen = (section._collapseGen || 0) + 1);

      if (willCollapse) {
        // Domino-out: play the fade/slide-down on the row children BEFORE
        // actually adding .collapsed (which hides them via display:none),
        // then lock in collapse once the cascade finishes.
        //
        // We wait on the REAL animations (getAnimations) rather than a fixed
        // timeout. Different sections animate different rows — .list-item in
        // most, .models-row in #models-section — so any hard-coded duration
        // either stalls with a dead pause (when the selector matches nothing,
        // as it did for #models-section) or guesses the wrong length. Force a
        // reflow first so the keyframes restart from the top.
        // eslint-disable-next-line no-unused-expressions
        section.offsetHeight;
        section.classList.add('section-just-collapsing');

        const lockCollapsed = () => {
          if (section._collapseGen !== gen) return; // superseded by a newer toggle
          section.classList.remove('section-just-collapsing');
          section.classList.add('collapsed');
        };
        // Only the domino-out keyframes gate the collapse — ignore unrelated
        // (and possibly infinite, e.g. spinners) animations in the subtree.
        const dominoOut = section.getAnimations({ subtree: true })
          .filter(a => a.animationName === 'section-domino-out');
        if (dominoOut.length === 0) {
          lockCollapsed(); // nothing to animate — collapse now, no dead pause
        } else {
          Promise.allSettled(dominoOut.map(a => a.finished)).then(lockCollapsed);
          // Safety net: if an animation never settles (e.g. element removed),
          // still lock in the collapse so the section can't get stuck open.
          setTimeout(lockCollapsed, 600);
        }
      } else {
        // Expand path — remove .collapsed and replay the inbound domino.
        section.classList.remove('collapsed');
        // eslint-disable-next-line no-unused-expressions
        section.offsetHeight;
        section.classList.add('section-just-expanded');
        setTimeout(() => {
          if (section._collapseGen !== gen) return; // superseded by a newer toggle
          section.classList.remove('section-just-expanded');
        }, 700);
      }
    }

    // Click title to collapse/expand
    const title = header.querySelector('h4') || header.querySelector('.section-title');
    if (title) {
      title.style.cursor = 'pointer';
      title.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollapse();
      });
    }

    // Click chevron button
    const chevronBtn = header.querySelector('.section-collapse-btn');
    if (chevronBtn) {
      chevronBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollapse();
      });
    }

    // Click anywhere on collapsed section to expand
    section.addEventListener('click', (e) => {
      if (!section.classList.contains('collapsed')) return;
      if (e.target.closest('button, select, .dropdown, .drag-handle')) return;
      e.stopPropagation();
      toggleCollapse();
    });
  });
}

/**
 * Initialize section drag reorder (mouse-based, desktop only).
 * @param {Object} Storage - Storage module
 * @param {Function} loadUIVis - Function that returns UI visibility state
 */
export function initSectionDrag(Storage, loadUIVis) {
  const sidebar = document.getElementById('sidebar');
  const sidebarInner = sidebar ? sidebar.querySelector('.sidebar-inner') : null;
  if (!sidebarInner) return;

  // Ensure every sidebar section carries a `draggable` attribute so the
  // existing UI-visibility machinery (app.js applyUIVis) can flip it on/off
  // when "Rearrange" is toggled in the Chats/Models sort dropdowns. Without
  // this, `.section[draggable]` queries return empty and the toggle silently
  // does nothing. Start at "false"; applyUIVis will set "true" if the user
  // previously enabled rearrange mode.
  sidebar.querySelectorAll('.section').forEach(section => {
    if (!section.hasAttribute('draggable')) section.setAttribute('draggable', 'false');
    // Inject a grab handle at the start of the section header. CSS keeps it
    // hidden by default and only reveals it under `body.rearrange-mode` —
    // the handle is the grab target onMouseDown looks for (`drag-handle`),
    // and it was the missing piece that made the whole feature inert.
    const header = section.querySelector('.section-header-flex');
    if (header && !header.querySelector('.drag-handle')) {
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.title = 'Drag to reorder';
      handle.setAttribute('aria-hidden', 'true');
      // Vertical-ellipsis grip, matching .item-drag-handle / .folder-drag-handle.
      handle.textContent = '\u22EE\u22EE';
      header.insertBefore(handle, header.firstChild);
    }
  });

  // Re-run applyUIVis so the freshly-attributed sections pick up the saved
  // rearrange preference (the first pass at app init ran before these
  // attributes existed and silently skipped them).
  try {
    if (typeof window.applyUIVis === 'function' && typeof window.loadUIVis === 'function') {
      window.applyUIVis(window.loadUIVis());
    }
  } catch (_) { /* non-fatal — default state is draggable=false */ }

  // Disable draggable on mobile to prevent scroll interference
  if ('ontouchstart' in window) {
    document.querySelectorAll('.section[draggable]').forEach(s => {
      s.setAttribute('draggable', 'false');
    });
  }

  let draggedSection = null;
  let placeholder = null;
  let offsetY = 0;

  function getSections() {
    return Array.from(sidebar.querySelectorAll('.section[draggable="true"]'));
  }

  function onMouseDown(e) {
    if (!e.target.classList.contains('drag-handle')) return;

    // Check if drag reorder is enabled
    const uiState = loadUIVis();
    if (uiState['section-drag-reorder'] === false) return;

    const section = e.target.closest('.section[draggable="true"]');
    if (!section) return;

    e.preventDefault();

    const rect = section.getBoundingClientRect();
    offsetY = e.clientY - rect.top;
    draggedSection = section;

    // Create placeholder
    placeholder = document.createElement('div');
    placeholder.className = 'section-placeholder';
    placeholder.style.cssText = `
      height: ${rect.height}px;
      margin: 4px 0;
      border: 2px dashed rgba(0, 170, 255, 0.5);
      border-radius: 8px;
      background: rgba(0, 170, 255, 0.1);
    `;
    section.parentNode.insertBefore(placeholder, section);

    // Float the section
    Object.assign(section.style, {
      position: 'fixed',
      width: rect.width + 'px',
      left: rect.left + 'px',
      top: rect.top + 'px',
      zIndex: '9999',
      opacity: '0.95',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      pointerEvents: 'none',
      transition: 'none'
    });

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!draggedSection) return;

    // Only move vertically - horizontal stays locked
    draggedSection.style.top = (e.clientY - offsetY) + 'px';

    const sections = getSections().filter(s => s !== draggedSection);
    const dragRect = draggedSection.getBoundingClientRect();
    const dragTop = dragRect.top;

    let insertBefore = null;

    // Find which section we should go before
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const rect = section.getBoundingClientRect();

      // If our top edge is above this section's bottom, we go before it
      if (dragTop < rect.bottom - 10) {
        insertBefore = section;
        break;
      }
    }

    // Move placeholder
    if (insertBefore) {
      if (placeholder.nextElementSibling !== insertBefore) {
        sidebarInner.insertBefore(placeholder, insertBefore);
      }
    } else if (sections.length > 0) {
      const lastSection = sections[sections.length - 1];
      if (placeholder !== lastSection.nextElementSibling) {
        sidebarInner.insertBefore(placeholder, lastSection.nextElementSibling);
      }
    }
  }

  function onMouseUp() {
    if (!draggedSection) return;

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    // Snap to placeholder - fast!
    const phRect = placeholder.getBoundingClientRect();
    draggedSection.style.transition = 'top 0.08s ease-out';
    draggedSection.style.top = phRect.top + 'px';

    setTimeout(() => {
      placeholder.parentNode.insertBefore(draggedSection, placeholder);
      placeholder.remove();
      draggedSection.style.cssText = '';

      // Save order
      const ids = getSections().map(s => s.id).filter(Boolean);
      Storage.setJSON(Storage.KEYS.SECTION_ORDER, ids);

      draggedSection = null;
      placeholder = null;
    }, 80);
  }

  sidebar.addEventListener('mousedown', onMouseDown);

  // Restore saved order on load
  try {
    const saved = Storage.get(Storage.KEYS.SECTION_ORDER);
    if (saved) {
      const order = JSON.parse(saved);
      order.forEach(id => {
        const section = document.getElementById(id);
        if (section) sidebarInner.appendChild(section);
      });
    }
  } catch (e) {}
}
