import { createArtifact } from '../artifacts.js';
export async function toDate(input, settings = {}) {
  const ts = parseInt(input, 10);
  if (isNaN(ts)) throw new Error('Invalid timestamp');
  const date = new Date(ts * 1000);
  const output = `UTC: ${date.toUTCString()}\nISO: ${date.toISOString()}\nLocal: ${date.toString()}`;
  return createArtifact({ kind: 'text', name: 'date.txt', mime: 'text/plain', data: output, meta: { operation: 'to-date', timestamp: ts } });
}
export async function toTimestamp(input, settings = {}) {
  const date = new Date(input);
  if (isNaN(date.getTime())) throw new Error('Invalid date string');
  const ts = Math.floor(date.getTime() / 1000);
  return createArtifact({ kind: 'text', name: 'timestamp.txt', mime: 'text/plain', data: String(ts), meta: { operation: 'to-timestamp', timestamp: ts } });
}
