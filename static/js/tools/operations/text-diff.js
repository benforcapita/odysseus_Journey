import { createArtifact } from '../artifacts.js';
export async function diff(input, settings = {}) {
  const { left = '', right = '' } = settings;
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const result = [];
  const maxLen = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < maxLen; i++) {
    const l = leftLines[i] || '';
    const r = rightLines[i] || '';
    if (l === r) result.push('  ' + l);
    else {
      if (l) result.push('- ' + l);
      if (r) result.push('+ ' + r);
    }
  }
  return createArtifact({ kind: 'text', name: 'diff.txt', mime: 'text/plain', data: result.join('\n'), meta: { operation: 'diff' } });
}
