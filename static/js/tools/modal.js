import { initToolsHub } from './index.js';

let hubPromise = null;

export function initToolsHubUI({ hubInit = initToolsHub } = {}) {
  const modal = document.getElementById('tools-modal');
  const container = document.getElementById('tools-hub-container');
  const closeButton = document.getElementById('close-tools-modal');
  const launchers = [
    document.getElementById('tool-tools-btn'),
    document.getElementById('rail-tools'),
  ].filter(Boolean);

  if (!modal || !container || launchers.length === 0) return null;

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
