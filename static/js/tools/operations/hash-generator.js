import { createArtifact } from '../artifacts.js';
export async function hash(input, settings = {}) {
  const algo = settings.algorithm || 'SHA-256';
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  let digest;
  if (algo === 'MD5' || algo === 'SHA-1') {
    // Legacy algorithms not in Web Crypto — use a fallback note
    throw new Error(algo + ' requires a polyfill. Use SHA-256 or SHA-512.');
  }
  const hashBuffer = await crypto.subtle.digest(algo, data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return createArtifact({ kind: 'text', name: 'hash.txt', mime: 'text/plain', data: hex, meta: { operation: 'hash', algorithm: algo } });
}
