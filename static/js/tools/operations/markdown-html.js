import { createArtifact } from '../artifacts.js';
export async function convert(input, settings = {}) {
  let html = input;
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  // Links & images
  html = html.replace(/!\[(.+?)\]\((.+?)\)/g, '<img alt="$1" src="$2">');
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  // Paragraphs
  html = html.replace(/^(?!<[hupol])[^\n]+$/gm, '<p>$&</p>');
  html = html.replace(/\n\n/g, '<br>');
  return createArtifact({ kind: 'text', name: 'output.html', mime: 'text/html', data: html, meta: { operation: 'convert' } });
}
