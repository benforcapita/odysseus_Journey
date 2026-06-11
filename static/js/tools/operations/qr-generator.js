/** Pure operation logic for the QR Code Generator tool. */

import { createArtifact } from '../artifacts.js';

/**
 * Generate a QR code as a data URL PNG.
 * Uses the existing qrcode.min.js library bundled with Odysseus.
 * @param {string} input - Text or URL to encode.
 * @param {object} settings
 * @param {number} [settings.size=256] - QR code size in pixels.
 * @returns {Promise<import('../artifacts.js').Artifact>}
 */
export async function generate(input, settings = {}) {
  const size = settings.size || 256;

  // Use the global QRCode library (qrcode.min.js)
  if (typeof QRCode === 'undefined') {
    throw new Error('QRCode library not loaded');
  }

  // Create a temporary canvas
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  // qrcode.min.js renders to a DOM element; we use a temp div
  const tempDiv = document.createElement('div');
  tempDiv.style.display = 'none';
  document.body.appendChild(tempDiv);

  return new Promise((resolve, reject) => {
    try {
      new QRCode(tempDiv, {
        text: input || '',
        width: size,
        height: size,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H,
      });

      // QRCode renders asynchronously via a small setTimeout internally
      setTimeout(() => {
        try {
          const img = tempDiv.querySelector('img');
          const dataUrl = img ? img.src : _renderCanvas(tempDiv, size);
          document.body.removeChild(tempDiv);
          resolve(createArtifact({
            kind: 'image',
            name: 'qrcode.png',
            mime: 'image/png',
            data: dataUrl,
            meta: { operation: 'generate', size },
          }));
        } catch (e) {
          document.body.removeChild(tempDiv);
          reject(e);
        }
      }, 100);
    } catch (e) {
      document.body.removeChild(tempDiv);
      reject(e);
    }
  });
}

function _renderCanvas(container, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const svg = container.querySelector('svg');
  if (svg) {
    // Draw the SVG onto canvas if available
  }
  // Fallback: draw what we can
  const img = container.querySelector('img');
  if (img) {
    ctx.drawImage(img, 0, 0, size, size);
  }
  return canvas.toDataURL('image/png');
}
