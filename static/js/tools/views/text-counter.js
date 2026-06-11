import { count } from '../operations/text-counter.js';
export async function render({ fetchImpl, onStatusChange }) {
  const root = document.createElement('div');
  const ta = document.createElement('textarea'); ta.className = 'tool-input-area'; ta.placeholder = 'Enter text to count...'; ta.rows = 10; ta.setAttribute('aria-label', 'Input'); root.appendChild(ta);
  const out = document.createElement('div'); out.className = 'tool-output-container'; root.appendChild(out);
  ta.addEventListener('input', async () => {
    const text = ta.value;
    const artifact = await count(text);
    out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = artifact.data; out.appendChild(pre);
  });
  // Initial count
  const a = await count(''); out.innerHTML = ''; const pre = document.createElement('pre'); pre.className = 'tool-output-text'; pre.textContent = a.data; out.appendChild(pre);
  return root;
}
