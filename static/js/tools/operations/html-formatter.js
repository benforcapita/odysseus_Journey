import { createArtifact } from '../artifacts.js';
export async function prettyPrint(input, settings = {}) {
  const indent = settings.indent || 2;
  const spaces = ' '.repeat(indent);
  let output = '', depth = 0;
  // Simple tag-based formatter
  const tokens = input.replace(/</g, '\n<').replace(/>/g, '>\n').split('\n').filter(l => l.trim());
  for (const token of tokens) {
    if (token.match(/^<\//)) { depth = Math.max(0, depth - 1); output += spaces.repeat(depth) + token.trim() + '\n'; }
    else if (token.match(/^<[^/!][^>]*[^/]>$/)) { output += spaces.repeat(depth) + token.trim() + '\n'; depth++; }
    else if (token.match(/^<[^/!][^>]*\/>$/)) { output += spaces.repeat(depth) + token.trim() + '\n'; }
    else { output += spaces.repeat(depth) + token.trim() + '\n'; }
  }
  return createArtifact({ kind: 'text', name: 'formatted.html', mime: 'text/html', data: output.trim(), meta: { operation: 'pretty-print', indent } });
}
export async function minify(input, settings = {}) {
  const output = input.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  return createArtifact({ kind: 'text', name: 'minified.html', mime: 'text/html', data: output, meta: { operation: 'minify' } });
}
