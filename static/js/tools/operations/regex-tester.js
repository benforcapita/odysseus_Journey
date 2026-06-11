import { createArtifact } from '../artifacts.js';
export async function test(input, settings = {}) {
  const { pattern = '', flags = 'g' } = settings;
  if (!pattern) throw new Error('No regex pattern provided');
  let regex;
  try { regex = new RegExp(pattern, flags); } catch (e) { throw new Error('Invalid regex: ' + e.message); }
  const matches = [];
  let match;
  if (flags.includes('g')) {
    while ((match = regex.exec(input)) !== null) {
      matches.push({ match: match[0], index: match.index, groups: match.groups || {} });
      if (match[0].length === 0) { regex.lastIndex++; if (regex.lastIndex > input.length) break; }
    }
  } else {
    match = regex.exec(input);
    if (match) matches.push({ match: match[0], index: match.index, groups: match.groups || {} });
  }
  const output = matches.length ? matches.map((m, i) => `Match ${i + 1}: "${m.match}" at position ${m.index}`).join('\n') : 'No matches found.';
  return createArtifact({ kind: 'text', name: 'regex-results.txt', mime: 'text/plain', data: output, meta: { operation: 'test', matchCount: matches.length } });
}
