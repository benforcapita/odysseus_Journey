import assert from 'node:assert/strict';
import { buildProjectHeroState, installProjectsNavigationClose, isDesktopBridgeAvailable, renderProjectTreeHtml, summarizeDiffStats } from '../../static/js/projects.js';

assert.equal(isDesktopBridgeAvailable({ pywebview: { api: { pick_folder() {} } } }), true);
assert.equal(isDesktopBridgeAvailable({}), false);
assert.deepEqual(
  summarizeDiffStats([{ diff: { added: 3, removed: 1, file: 'app.py' } }, { diff: { added: 2, removed: 0, file: 'style.css' } }]),
  { files: 2, added: 5, removed: 1 }
);

// Defensive: null/undefined and entries without a diff are skipped, not thrown.
assert.deepEqual(summarizeDiffStats([null, { output: 'no diff here' }]), { files: 0, added: 0, removed: 0 });
assert.deepEqual(summarizeDiffStats(undefined), { files: 0, added: 0, removed: 0 });
assert.deepEqual(
  buildProjectHeroState({
    name: 'Odysseus',
    folder_path: '/Users/ben/odysseus',
    model: 'gpt-5',
    git_branch: 'codex/projects',
    auto_approve: false,
  }),
  {
    title: 'What should we build in Odysseus',
    directory: '/Users/ben/odysseus',
    model: 'gpt-5',
    branch: 'codex/projects',
    access: 'Ask before changes',
  }
);
assert.equal(buildProjectHeroState(null).title, 'What should we build');
assert.equal(
  renderProjectTreeHtml([{ kind: 'file', name: 'app.py', path: 'app.py' }, { kind: 'folder', name: 'static', path: 'static' }]),
  '<div class="projects-file-row" title="static">static/</div>'
);

function fakeClassList(...initial) {
  const set = new Set(initial);
  return {
    add: (...names) => names.forEach(name => set.add(name)),
    remove: (...names) => names.forEach(name => set.delete(name)),
    contains: name => set.has(name),
  };
}

function fakeEl(id, classes = []) {
  return {
    id,
    classList: fakeClassList(...classes),
    closest(selector) {
      if (selector === '.icon-rail-btn, .list-item, .sidebar-brand') {
        return this.classList.contains('icon-rail-btn') || this.classList.contains('list-item') || this.classList.contains('sidebar-brand') ? this : null;
      }
      return null;
    },
  };
}

const chat = fakeEl('chat-container', ['hidden']);
const projects = fakeEl('projects-view');
const railProjects = fakeEl('rail-projects', ['active-section', 'icon-rail-btn']);
const railGallery = fakeEl('rail-gallery', ['icon-rail-btn']);
const listeners = {};
const fakeDoc = {
  getElementById(id) {
    return { 'chat-container': chat, 'projects-view': projects, 'rail-projects': railProjects }[id] || null;
  },
  addEventListener(type, fn) {
    listeners[type] = fn;
  },
};

installProjectsNavigationClose(fakeDoc);
listeners.click({ target: railProjects });
assert.equal(chat.classList.contains('hidden'), true);
listeners.click({ target: railGallery });
assert.equal(chat.classList.contains('hidden'), false);
assert.equal(projects.classList.contains('hidden'), true);
assert.equal(railProjects.classList.contains('active-section'), false);

console.log('projects-ui.test.mjs OK');
