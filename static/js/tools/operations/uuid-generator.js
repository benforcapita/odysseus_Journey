import { createArtifact } from '../artifacts.js';
export async function generate(input, settings = {}) {
  const count = settings.count || 1;
  const uuids = [];
  for (let i = 0; i < count; i++) {
    uuids.push(crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  }
  const output = uuids.join('\n');
  return createArtifact({ kind: 'text', name: 'uuids.txt', mime: 'text/plain', data: output, meta: { operation: 'generate', count } });
}
