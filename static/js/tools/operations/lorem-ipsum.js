import { createArtifact } from '../artifacts.js';
const WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'.split(' ');
export async function generate(input, settings = {}) {
  const count = settings.count || 3;
  const mode = settings.mode || 'paragraphs';
  let output = '';
  if (mode === 'words') {
    output = WORDS.slice(0, Math.min(count, WORDS.length)).join(' ');
  } else if (mode === 'sentences') {
    for (let i = 0; i < count; i++) {
      const start = (i * 8) % WORDS.length;
      const sentence = WORDS.slice(start, start + 8).join(' ');
      output += sentence.charAt(0).toUpperCase() + sentence.slice(1) + '. ';
    }
  } else {
    for (let i = 0; i < count; i++) {
      const start = (i * 20) % WORDS.length;
      output += WORDS.slice(start, start + 20).join(' ') + '.\n\n';
    }
  }
  return createArtifact({ kind: 'text', name: 'lorem.txt', mime: 'text/plain', data: output.trim(), meta: { operation: 'generate', count, mode } });
}
