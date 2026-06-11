import { createArtifact } from '../artifacts.js';
export async function convert(input, settings = {}) {
  const width = settings.width || 512;
  const height = settings.height || 512;
  const svgText = input instanceof File || input instanceof Blob ? await input.text() : input;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/png');
      resolve(createArtifact({ kind: 'image', name: 'converted.png', mime: 'image/png', data: dataUrl, meta: { operation: 'convert', width, height } }));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Invalid SVG')); };
    img.src = url;
  });
}
