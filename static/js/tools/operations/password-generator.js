import { createArtifact } from '../artifacts.js';
export async function generate(input, settings = {}) {
  const length = settings.length || 20;
  const upper = settings.upper !== false;
  const lower = settings.lower !== false;
  const digits = settings.digits !== false;
  const symbols = settings.symbols || false;
  let chars = '';
  if (upper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (lower) chars += 'abcdefghijklmnopqrstuvwxyz';
  if (digits) chars += '0123456789';
  if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
  if (!chars) chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let password = '';
  for (let i = 0; i < length; i++) password += chars[array[i] % chars.length];
  return createArtifact({ kind: 'text', name: 'password.txt', mime: 'text/plain', data: password, meta: { operation: 'generate', length } });
}
