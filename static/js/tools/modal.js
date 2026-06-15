import { initToolsHub } from './index.js';
import { makeWindowDraggable } from '../windowDrag.js';

let hubPromise = null;

export function initToolsHubUI({ hubInit = initToolsHub, makeWindowDraggableImpl = makeWindowDraggable } = {}) {
  const modal = document.getElementById('tools-modal');
  const container = document.getElementById('tools-hub-container');
  const closeButton = document.getElementById('close-tools-modal');
  const launchers = [
    document.getElementById('tool-tools-btn'),
    document.getElementById('rail-tools'),
  ].filter(Boolean);

  if (!modal || !container || launchers.length === 0) return null;

  const content = modal.querySelector('.modal-content');
  const header = content?.querySelector('.modal-header');

  // Wire the shared drag / snap / resize system so the Tools Hub behaves
  // like the other tool windows (email, library, etc.).
  if (content && header && makeWindowDraggableImpl) {
    const enterFullscreen = () => {
      content.classList.add('tools-modal-fullscreen');
      content.style.position = 'fixed';
      content.style.left = '0';
      content.style.top = '0';
      content.style.right = '0';
      content.style.bottom = '0';
      content.style.width = '100vw';
      content.style.maxWidth = '100vw';
      content.style.height = '100vh';
      content.style.maxHeight = '100vh';
      content.style.borderRadius = '0';
      content.style.transform = 'none';
      content.style.margin = '0';
    };
    const exitFullscreen = (cx, cy) => {
      content.classList.remove('tools-modal-fullscreen');
      const w = Math.min(1120, window.innerWidth * 0.94);
      const h = Math.min(760, window.innerHeight * 0.88);
      content.style.position = 'fixed';
      content.style.left = Math.max(8, cx - w / 2) + 'px';
      content.style.top = Math.max(8, cy - 20) + 'px';
      content.style.right = '';
      content.style.bottom = '';
      content.style.width = w + 'px';
      content.style.maxWidth = '';
      content.style.height = h + 'px';
      content.style.maxHeight = '88vh';
      content.style.borderRadius = '';
      content.style.transform = 'none';
      content.style.margin = '0';
    };
    makeWindowDraggableImpl(modal, {
      content,
      header,
      fsClass: 'tools-modal-fullscreen',
      skipSelector: '.close-btn',
      onEnterFullscreen: enterFullscreen,
      onExitFullscreen: exitFullscreen,
    });
  }

  async function ensureHub() {
    if (!hubPromise) {
      container.textContent = 'Loading tools...';
      hubPromise = hubInit({ container }).catch((error) => {
        hubPromise = null;
        container.textContent = `Could not load Tools Hub: ${error.message}`;
        container.setAttribute('role', 'alert');
        throw error;
      });
    }
    return hubPromise;
  }

  async function open() {
    modal.classList.remove('hidden');
    try {
      await ensureHub();
      container.querySelector('input[type="search"]')?.focus();
    } catch (error) {
      console.error('Tools Hub initialization failed:', error);
    }
  }

  function close() {
    modal.classList.add('hidden');
  }

  launchers.forEach((launcher) => launcher.addEventListener('click', open));
  closeButton?.addEventListener('click', close);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });

  return { open, close };
}
