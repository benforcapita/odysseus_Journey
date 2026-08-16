import assert from 'node:assert/strict';
import { buildProjectHeroState, validateProjectSubmission, flattenProjectModels, installProjectsNavigationClose, isDesktopBridgeAvailable, reduceProjectStreamState, renderProjectTreeHtml, shouldCenterProjectComposer, summarizeDiffStats, projectStreamErrorMessage } from '../../static/js/projects.js';

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
assert.equal(shouldCenterProjectComposer({ messages: [] }), true);
assert.equal(shouldCenterProjectComposer({ messages: [{ role: 'user', content: 'hi' }] }), false);
assert.deepEqual(
  reduceProjectStreamState({ assistantText: '' }, { delta: 'Hello' }),
  { assistantText: 'Hello', changed: true }
);
assert.deepEqual(
  reduceProjectStreamState({ assistantText: 'Hello' }, { type: 'tool_output' }),
  { assistantText: 'Hello', changed: false }
);
assert.equal(
  renderProjectTreeHtml([{ kind: 'file', name: 'app.py', path: 'app.py' }, { kind: 'folder', name: 'static', path: 'static' }]),
  '<div class="projects-file-row" title="static">static/</div>'
);
assert.deepEqual(
  flattenProjectModels([{ name: 'Local', url: 'http://localhost', endpoint_id: 'ep1', models: ['gpt-5'], models_display: ['GPT 5'] }]),
  [{ model: 'gpt-5', displayName: 'GPT 5', endpointUrl: 'http://localhost', endpointId: 'ep1', endpointName: 'Local' }]
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


// validateProjectSubmission gates the composer: empty input is a silent no-op,
// a missing project surfaces a folder hint, and a missing model (when models
// are available to choose) surfaces a model hint. Otherwise the send proceeds.
assert.deepEqual(validateProjectSubmission(null, '', false), { ok: false, error: '' });
assert.deepEqual(validateProjectSubmission(null, '  ', false), { ok: false, error: '' });
assert.deepEqual(validateProjectSubmission(null, 'build a todo app', false), {
  ok: false,
  error: 'Choose a project folder to start chatting',
});
assert.deepEqual(validateProjectSubmission({ model: '' }, 'build a todo app', true), {
  ok: false,
  error: 'Pick a model before sending',
});
assert.deepEqual(validateProjectSubmission({ model: 'gpt-5' }, 'build a todo app', true), {
  ok: true,
  error: '',
});
// No models loaded yet: don't block on a missing model — let the backend try
// and surface a real error instead of a premature guard.
assert.deepEqual(validateProjectSubmission({ model: '' }, 'build a todo app', false), {
  ok: true,
  error: '',
});

// Named `event: error` SSE payloads arrive as MessageEvents with .data;
// real connection failures arrive as plain Events with no .data. The helper
// must surface the upstream status/text and return null for non-error events
// so the caller falls back to the generic "no response" message.
assert.equal(projectStreamErrorMessage({ data: '' }), null);
assert.equal(projectStreamErrorMessage({}), null);
assert.equal(projectStreamErrorMessage({ data: 'not-json' }), null);
assert.equal(
  projectStreamErrorMessage({ data: JSON.stringify({ status: 404, text: 'model not found' }) }),
  'Project agent error: model not found'
);
assert.equal(
  projectStreamErrorMessage({ data: JSON.stringify({ error: 'Cannot reach localhost:11434', status: 503 }) }),
  'Project agent error: Cannot reach localhost:11434'
);
assert.equal(
  projectStreamErrorMessage({ data: JSON.stringify({ status: 500 }) }),
  'Project agent error: Error 500'
);
assert.equal(
  projectStreamErrorMessage({ data: JSON.stringify({ delta: 'hello' }) }),
  null
);

console.log('projects-ui.test.mjs OK');
