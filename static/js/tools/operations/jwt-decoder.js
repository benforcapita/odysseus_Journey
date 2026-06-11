import { createArtifact } from '../artifacts.js';
export async function decode(input, settings = {}) {
  const parts = input.trim().split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT: expected 3 dot-separated parts');
  function decodePart(part) { const b = part.replace(/-/g, '+').replace(/_/g, '/'); const json = atob(b); return JSON.parse(json); }
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  const output = JSON.stringify({ header, payload }, null, 2);
  return createArtifact({ kind: 'text', name: 'jwt-decoded.json', mime: 'application/json', data: output, meta: { operation: 'decode', alg: header.alg, typ: header.typ } });
}
