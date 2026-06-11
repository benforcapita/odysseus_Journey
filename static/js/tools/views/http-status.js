import { lookup } from '../operations/http-status.js';
import { createOutputArea } from '../workspace.js';
import { executeTool, saveOutput } from '../runtime.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'tool-input-text'; inp.placeholder = 'Search by code or description (e.g. 404 or "not found")'; inp.setAttribute('aria-label', 'Search HTTP codes'); root.appendChild(inp);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  async function run() {
    const q = inp.value.trim(); if (!q) { out.innerHTML = ''; return; }
    const artifact = await lookup(q);
    out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
  }
  inp.addEventListener('input', run);
  return root;
}
