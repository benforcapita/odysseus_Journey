/** Pure operation logic for the JSON Formatter tool. */

import { createArtifact } from '../artifacts.js';

/**
 * Pretty-print JSON with indentation.
 * @param {string} input - Raw JSON text.
 * @param {object} settings
 * @param {number} [settings.indent=2] - Spaces per indentation level.
 * @returns {Promise<import('../artifacts.js').Artifact>}
 */
export async function prettyPrint(input, settings = {}) {
  const indent = settings.indent ?? 2;
  const parsed = JSON.parse(input);
  const output = JSON.stringify(parsed, null, indent);
  return createArtifact({
    kind: 'text',
    name: 'formatted.json',
    mime: 'application/json',
    data: output,
    meta: { operation: 'pretty-print', indent },
  });
}

/**
 * Minify JSON by removing all insignificant whitespace.
 * @param {string} input
 * @returns {Promise<import('../artifacts.js').Artifact>}
 */
export async function minify(input) {
  const parsed = JSON.parse(input);
  const output = JSON.stringify(parsed);
  return createArtifact({
    kind: 'text',
    name: 'minified.json',
    mime: 'application/json',
    data: output,
    meta: { operation: 'minify' },
  });
}

/**
 * Validate whether the input is valid JSON.
 * @param {string} input
 * @returns {Promise<import('../artifacts.js').Artifact>}
 */
export async function validate(input) {
  try {
    JSON.parse(input);
    return createArtifact({
      kind: 'text',
      name: 'validation-result.txt',
      mime: 'text/plain',
      data: 'Valid JSON',
      meta: { operation: 'validate', valid: true },
    });
  } catch (err) {
    return createArtifact({
      kind: 'text',
      name: 'validation-result.txt',
      mime: 'text/plain',
      data: 'Invalid JSON: ' + err.message,
      meta: { operation: 'validate', valid: false },
    });
  }
}
