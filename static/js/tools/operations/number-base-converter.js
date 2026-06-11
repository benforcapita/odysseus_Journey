import { createArtifact } from '../artifacts.js';
export async function convert(input, settings = {}) {
  const from = settings.from || 10;
  const to = settings.to || 16;
  const num = parseInt(input, from);
  if (isNaN(num)) throw new Error('Invalid number for base ' + from);
  const output = num.toString(to);
  return createArtifact({ kind: 'text', name: 'converted.txt', mime: 'text/plain', data: output, meta: { operation: 'convert', from, to, value: output } });
}
