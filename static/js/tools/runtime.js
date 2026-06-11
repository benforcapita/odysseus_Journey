/**
 * Shared browser operation runtime.
 *
 * The runtime provides a uniform execution contract: start a run via the API,
 * execute a pure operation function, complete the run, and return the result.
 * It never silently changes privacy boundaries.
 */

import { createArtifact, saveArtifact } from './artifacts.js';

/**
 * @callback OperationFn
 * @param {*} input - The input payload.
 * @param {object} settings - Key-value settings for the operation.
 * @param {object} ctx - Execution context (AbortSignal, etc.).
 * @returns {Promise<import('./artifacts.js').Artifact>}
 */

/**
 * Execute a tool operation with unified run lifecycle.
 *
 * @param {object} opts
 * @param {string} opts.toolId
 * @param {string} opts.owner
 * @param {OperationFn} opts.operationFn
 * @param {*} opts.input
 * @param {object} [opts.settings]
 * @param {AbortSignal} [opts.signal]
 * @param {typeof fetch} [opts.fetchImpl] - fetch override for tests.
 * @returns {Promise<{run: object, artifact: import('./artifacts.js').Artifact}>}
 */
export async function executeTool(opts) {
  const { toolId, owner, operationFn, input, settings = {}, signal, fetchImpl = fetch } = opts;

  // 1. Create run record
  const createResp = await fetchImpl('/api/tools/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool_id: toolId,
      operation: settings.operation || '',
      settings,
    }),
  });
  if (!createResp.ok) throw new Error('Failed to create run');
  const run = await createResp.json();

  // 2. Execute the operation
  let artifact;
  try {
    artifact = await operationFn(input, settings, { signal });
  } catch (err) {
    // Record failure
    await fetchImpl(`/api/tools/runs/${encodeURIComponent(run.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'failed', error: String(err.message || err) }),
    });
    throw err;
  }

  // 3. Complete run
  const completeResp = await fetchImpl(`/api/tools/runs/${encodeURIComponent(run.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'completed',
      output_metadata: {
        kind: artifact.kind,
        name: artifact.name,
        mime: artifact.mime,
      },
    }),
  });
  if (!completeResp.ok) throw new Error('Failed to complete run');

  return { run, artifact };
}

/**
 * Save an artifact for a completed run.
 * @param {import('./artifacts.js').Artifact} artifact
 * @param {string} runId
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{destination: string, record: object}>}
 */
export async function saveOutput(artifact, runId, fetchImpl = fetch) {
  return saveArtifact(artifact, runId, { fetchImpl });
}

export { createArtifact, saveArtifact };
