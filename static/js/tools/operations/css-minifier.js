import { createArtifact } from '../artifacts.js';
export async function minify(input, settings = {}) {
  let css = input;
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  css = css.replace(/\s+/g, ' ');
  css = css.replace(/\s*([{}:;,])\s*/g, '$1');
  css = css.replace(/;}/g, '}');
  css = css.trim();
  return createArtifact({ kind: 'text', name: 'minified.css', mime: 'text/css', data: css, meta: { operation: 'minify' } });
}
export async function prettyPrint(input, settings = {}) {
  const indent = settings.indent || 2;
  const spaces = ' '.repeat(indent);
  let css = input.replace(/\s+/g, ' ');
  css = css.replace(/([{};])/g, '$1\n');
  let output = '', depth = 0;
  for (const line of css.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes('}')) depth = Math.max(0, depth - 1);
    output += spaces.repeat(depth) + trimmed + '\n';
    if (trimmed.includes('{') && !trimmed.includes('}')) depth++;
  }
  return createArtifact({ kind: 'text', name: 'formatted.css', mime: 'text/css', data: output.trim(), meta: { operation: 'pretty-print' } });
}
