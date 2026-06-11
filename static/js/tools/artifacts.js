/**
 * Typed artifact model and persistence routing.
 *
 * Artifacts carry kind, name, mime, data, and optional metadata. The save
 * function routes images to Gallery, PDFs to Library, and generic text blobs
 * to the Library persist endpoint.
 */

/**
 * @typedef {'text'|'image'|'pdf'|'unknown'} ArtifactKind
 *
 * @typedef {object} Artifact
 * @property {ArtifactKind} kind
 * @property {string} name - Display / file name.
 * @property {string} mime - MIME type (e.g. "image/png", "application/pdf").
 * @property {string|Blob} data - The actual payload.
 * @property {object} [meta] - Optional extra metadata.
 */

/**
 * Create a typed artifact.
 * @param {object} opts
 * @param {ArtifactKind} opts.kind
 * @param {string} opts.name
 * @param {string} opts.mime
 * @param {string|Blob} opts.data
 * @param {object} [opts.meta]
 * @returns {Artifact}
 */
export function createArtifact({ kind, name, mime, data, meta = {} }) {
  return { kind, name, mime, data, meta };
}

/**
 * Persist an artifact to the appropriate destination and mark the run as saved.
 * @param {Artifact} item
 * @param {string} runId
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] - fetch override for Node tests.
 * @returns {Promise<{destination: string, record: object}>}
 */
export async function saveArtifact(item, runId, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;

  async function markSaved(destination, record) {
    await fetchImpl(`/api/tools/runs/${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed',
        saved: true,
        outputs: [{ destination, id: record.id, name: item.name, kind: item.kind }],
      }),
    });
    return { destination, record };
  }

  if (item.kind === 'image') {
    const blob = item.data instanceof Blob ? item.data : await (await fetchImpl(item.data)).blob();
    const form = new FormData();
    form.append('file', blob, item.name);
    const response = await fetchImpl('/api/gallery/upload', { method: 'POST', body: form });
    if (!response.ok) throw new Error('Could not save image to Gallery');
    return markSaved('gallery', await response.json());
  }

  if (item.mime === 'application/pdf' && item.data instanceof Blob) {
    const form = new FormData();
    form.append('file', item.data, item.name);
    const response = await fetchImpl('/api/documents/import-pdf', { method: 'POST', body: form });
    if (!response.ok) throw new Error('Could not save PDF to Library');
    return markSaved('library', await response.json());
  }

  const response = await fetchImpl(
    `/api/tools/runs/${encodeURIComponent(runId)}/persist`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artifact: {
          kind: item.kind,
          name: item.name,
          mime: item.mime,
          text: String(item.data ?? ''),
        },
      }),
    }
  );
  if (!response.ok) throw new Error('Could not save artifact to Library');
  return { destination: 'library', record: await response.json() };
}
