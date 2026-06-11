import { createArtifact } from '../artifacts.js';
function hexToRgb(hex) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
}
export async function convert(input, settings = {}) {
  input = input.trim();
  let r, g, b;
  if (input.startsWith('#') || input.match(/^[a-f\d]{6}$/i)) {
    const rgb = hexToRgb(input);
    if (!rgb) throw new Error('Invalid HEX color');
    r = rgb.r; g = rgb.g; b = rgb.b;
  } else if (input.startsWith('rgb')) {
    const m = input.match(/rgb\(?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)?/i);
    if (!m) throw new Error('Invalid RGB color');
    r = parseInt(m[1]); g = parseInt(m[2]); b = parseInt(m[3]);
  } else if (input.startsWith('hsl')) {
    const m = input.match(/hsl\(?\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)?/i);
    if (!m) throw new Error('Invalid HSL color');
    const h = parseInt(m[1]) / 360, s = parseInt(m[2]) / 100, l = parseInt(m[3]) / 100;
    if (s === 0) { r = g = b = l; } else {
      const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
      g = Math.round(hue2rgb(p, q, h) * 255);
      b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
    }
  } else {
    throw new Error('Unrecognized color format. Use HEX (#ff0000), RGB, or HSL.');
  }
  const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  const hsl = rgbToHsl(r, g, b);
  const hsv = rgbToHsv(r, g, b);
  const output = `HEX: ${hex}\nRGB: rgb(${r}, ${g}, ${b})\nHSL: hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)\nHSV: hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`;
  return createArtifact({ kind: 'text', name: 'color.txt', mime: 'text/plain', data: output, meta: { operation: 'convert', hex, rgb: { r, g, b }, hsl } });
}
