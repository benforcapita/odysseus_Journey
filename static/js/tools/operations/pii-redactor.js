/** Pure operation logic for the Structured PII Redactor tool. */

import { createArtifact } from '../artifacts.js';

// Regex patterns for common PII types
const PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  phone: /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  'credit-card': /\b(?:\d[ -]*?){13,19}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
};

const REPLACEMENTS = {
  email: '[EMAIL]',
  phone: '[PHONE]',
  'credit-card': '[CREDIT_CARD]',
  ssn: '[SSN]',
};

/**
 * Redact PII patterns from text.
 * @param {string} input
 * @param {object} settings
 * @param {string[]} [settings.types] - Which PII types to redact. Default: all.
 * @returns {Promise<import('../artifacts.js').Artifact>}
 */
export async function redact(input, settings = {}) {
  const types = settings.types || Object.keys(PATTERNS);
  let output = input;
  const found = {};

  for (const type of types) {
    const pattern = PATTERNS[type];
    if (!pattern) continue;
    const matches = input.match(pattern);
    if (matches) {
      found[type] = matches.length;
      output = output.replace(pattern, REPLACEMENTS[type] || '[REDACTED]');
    }
  }

  return createArtifact({
    kind: 'text',
    name: 'redacted.txt',
    mime: 'text/plain',
    data: output,
    meta: { operation: 'redact', found },
  });
}
