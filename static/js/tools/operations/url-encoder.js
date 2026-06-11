import { createArtifact } from '../artifacts.js';
export async function encode(input, settings = {}) {
  const output = encodeURIComponent(input);
  return createArtifact({ kind: 'text', name: 'encoded.txt', mime: 'text/plain', data: output, meta: { operation: 'encode' } });
}
export async function decode(input, settings = {}) {
  const output = decodeURIComponent(input);
  return createArtifact({ kind: 'text', name: 'decoded.txt', mime: 'text/plain', data: output, meta: { operation: 'decode' } });
}
