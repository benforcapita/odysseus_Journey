import { createArtifact } from '../artifacts.js';
export async function sort(input, settings = {}) {
  const method = settings.method || 'alphabetical';
  const direction = settings.direction || 'asc';
  let lines = input.split('\n').filter(l => l.trim() !== '' || settings.keepEmpty);
  switch (method) {
    case 'alphabetical': lines.sort((a, b) => a.localeCompare(b)); break;
    case 'numeric': lines.sort((a, b) => parseFloat(a) - parseFloat(b)); break;
    case 'length': lines.sort((a, b) => a.length - b.length); break;
    case 'random': lines.sort(() => Math.random() - 0.5); break;
  }
  if (direction === 'desc') lines.reverse();
  const output = lines.join('\n');
  return createArtifact({ kind: 'text', name: 'sorted.txt', mime: 'text/plain', data: output, meta: { operation: 'sort', method, direction } });
}
