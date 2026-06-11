import { createArtifact } from '../artifacts.js';
export async function count(input, settings = {}) {
  const chars = input.length;
  const charsNoSpace = input.replace(/\s/g, '').length;
  const words = input.trim() ? input.trim().split(/\s+/).length : 0;
  const lines = input ? input.split('\n').length : 0;
  const sentences = input ? (input.match(/[^.!?]+[.!?]+/g) || []).length : 0;
  const paragraphs = input.trim() ? input.trim().split(/\n\s*\n/).length : 0;
  const output = `Characters: ${chars}\nCharacters (no spaces): ${charsNoSpace}\nWords: ${words}\nLines: ${lines}\nSentences: ${sentences}\nParagraphs: ${paragraphs}`;
  return createArtifact({ kind: 'text', name: 'count.txt', mime: 'text/plain', data: output, meta: { operation: 'count', chars, words, lines } });
}
