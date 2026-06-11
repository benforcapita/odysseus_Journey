/** Pure operation logic for the PDF Toolkit — merge and split using pdf-lib. */

import { createArtifact } from '../artifacts.js';

/**
 * Read a File/Blob as an ArrayBuffer.
 * @param {File|Blob} file
 * @returns {Promise<ArrayBuffer>}
 */
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Merge multiple PDF files into a single PDF.
 * @param {File[]|Blob[]} files
 * @param {object} settings
 * @returns {Promise<import('../artifacts.js').Artifact>}
 */
export async function merge(files, settings = {}) {
  if (!files || files.length < 2) {
    throw new Error('Please provide at least two PDF files to merge');
  }

  // Dynamically import pdf-lib (vendored or CDN)
  const { PDFDocument } = await import('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
  const mergedDoc = await PDFDocument.create();

  for (const file of files) {
    const buffer = await readFile(file);
    const doc = await PDFDocument.load(buffer);
    const pages = await mergedDoc.copyPages(doc, doc.getPageIndices());
    pages.forEach(page => mergedDoc.addPage(page));
  }

  const pdfBytes = await mergedDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });

  return createArtifact({
    kind: 'pdf',
    name: 'merged.pdf',
    mime: 'application/pdf',
    data: blob,
    meta: { operation: 'merge', pageCount: mergedDoc.getPageCount(), fileCount: files.length },
  });
}

/**
 * Split a PDF into individual pages.
 * @param {File|Blob} file
 * @param {object} settings
 * @returns {Promise<import('../artifacts.js').Artifact[]>} Array of artifacts (one per page).
 */
export async function split(file, settings = {}) {
  const { PDFDocument } = await import('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
  const buffer = await readFile(file);
  const sourceDoc = await PDFDocument.load(buffer);
  const pageCount = sourceDoc.getPageCount();

  const results = [];
  for (let i = 0; i < pageCount; i++) {
    const newDoc = await PDFDocument.create();
    const [page] = await newDoc.copyPages(sourceDoc, [i]);
    newDoc.addPage(page);
    const pdfBytes = await newDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    results.push(createArtifact({
      kind: 'pdf',
      name: `page-${i + 1}.pdf`,
      mime: 'application/pdf',
      data: blob,
      meta: { operation: 'split', pageIndex: i, totalPages: pageCount },
    }));
  }

  return results;
}
