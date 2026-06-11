/** Pure operation logic for the Image Resizer tool — Canvas-based transforms. */

import { createArtifact } from '../artifacts.js';

/**
 * Load an image from a File or Blob into an HTMLImageElement.
 * @param {File|Blob} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * Resize an image to new pixel dimensions.
 * @param {File|Blob} file
 * @param {object} settings
 * @param {number} settings.width
 * @param {number} settings.height
 * @returns {Promise<import('../artifacts.js').Artifact>}
 */
export async function resize(file, settings = {}) {
  const width = settings.width || 800;
  const height = settings.height || 600;
  const img = await loadImage(file);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/png');
  return createArtifact({
    kind: 'image',
    name: 'resized.png',
    mime: 'image/png',
    data: dataUrl,
    meta: { operation: 'resize', width, height },
  });
}

/**
 * Rotate an image by 90, 180, or 270 degrees.
 * @param {File|Blob} file
 * @param {object} settings
 * @param {number} settings.degrees - One of 90, 180, 270.
 * @returns {Promise<import('../artifacts.js').Artifact>}
 */
export async function rotate(file, settings = {}) {
  const degrees = settings.degrees || 90;
  const img = await loadImage(file);

  const swaps = [90, 270].includes(degrees);
  const canvas = document.createElement('canvas');
  canvas.width = swaps ? img.height : img.width;
  canvas.height = swaps ? img.width : img.height;
  const ctx = canvas.getContext('2d');

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  const dataUrl = canvas.toDataURL('image/png');
  return createArtifact({
    kind: 'image',
    name: 'rotated.png',
    mime: 'image/png',
    data: dataUrl,
    meta: { operation: 'rotate', degrees },
  });
}
