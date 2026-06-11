import { createArtifact } from '../artifacts.js';
// Simple field descriptions
const FIELD_NAMES = ['minute', 'hour', 'day of month', 'month', 'day of week'];
export async function parse(input, settings = {}) {
  const parts = input.trim().split(/\s+/);
  if (parts.length < 5) throw new Error('Cron expression must have 5 fields');
  const lines = ['Cron: ' + input.trim(), ''];
  for (let i = 0; i < 5; i++) {
    let desc = '*';
    const p = parts[i];
    if (p === '*') desc = 'every';
    else if (p.includes(',')) desc = 'at ' + p;
    else if (p.includes('-')) desc = 'range ' + p;
    else if (p.includes('/')) desc = 'every ' + p.split('/')[1] + ' starting at ' + (p.split('/')[0] || '0');
    else desc = p;
    lines.push(FIELD_NAMES[i] + ': ' + desc);
  }
  const output = lines.join('\n');
  return createArtifact({ kind: 'text', name: 'cron.txt', mime: 'text/plain', data: output, meta: { operation: 'parse', fields: parts } });
}
