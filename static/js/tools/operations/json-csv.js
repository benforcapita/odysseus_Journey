import { createArtifact } from '../artifacts.js';
export async function jsonToCsv(input, settings = {}) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const arr = Array.isArray(data) ? data : [data];
  if (!arr.length) throw new Error('Empty array');
  const keys = Object.keys(arr[0]);
  const header = keys.join(',');
  const rows = arr.map(obj => keys.map(k => { const v = obj[k]; return v === null || v === undefined ? '' : '"' + String(v).replace(/"/g, '""') + '"'; }).join(','));
  const output = [header, ...rows].join('\n');
  return createArtifact({ kind: 'text', name: 'output.csv', mime: 'text/csv', data: output, meta: { operation: 'json-to-csv', rows: arr.length } });
}
export async function csvToJson(input, settings = {}) {
  const lines = input.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');
  const headers = lines[0].split(',').map(h => h.trim());
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, j) => { obj[h] = vals[j] || ''; });
    result.push(obj);
  }
  const output = JSON.stringify(result, null, 2);
  return createArtifact({ kind: 'text', name: 'output.json', mime: 'application/json', data: output, meta: { operation: 'csv-to-json', rows: result.length } });
}
