import { createArtifact } from '../artifacts.js';
const CONVERSIONS = {
  length: { m: 1, km: 0.001, cm: 100, mm: 1000, mi: 0.000621371, yd: 1.09361, ft: 3.28084, in: 39.3701 },
  mass: { kg: 1, g: 1000, mg: 1e6, lb: 2.20462, oz: 35.274 },
  temperature: 'special',
  area: { m2: 1, km2: 1e-6, ha: 0.0001, ft2: 10.7639, ac: 0.000247105 },
  volume: { l: 1, ml: 1000, m3: 0.001, gal: 0.264172, qt: 1.05669, pt: 2.11338, cup: 4.22675, floz: 33.814 },
  speed: { 'm/s': 1, 'km/h': 3.6, mph: 2.23694, knot: 1.94384 },
};
export async function convert(input, settings = {}) {
  const category = settings.category || 'length';
  const from = settings.from || 'm';
  const to = settings.to || 'ft';
  const value = parseFloat(input);
  if (isNaN(value)) throw new Error('Invalid number');
  const conv = CONVERSIONS[category];
  if (!conv) throw new Error('Unknown category: ' + category);
  let result;
  if (category === 'temperature') {
    if (from === 'C' && to === 'F') result = value * 9/5 + 32;
    else if (from === 'F' && to === 'C') result = (value - 32) * 5/9;
    else if (from === 'C' && to === 'K') result = value + 273.15;
    else if (from === 'K' && to === 'C') result = value - 273.15;
    else if (from === 'F' && to === 'K') result = (value - 32) * 5/9 + 273.15;
    else if (from === 'K' && to === 'F') result = (value - 273.15) * 9/5 + 32;
    else result = value;
  } else {
    const base = value / conv[from];
    result = base * conv[to];
  }
  const output = `${value} ${from} = ${result.toFixed(6)} ${to}`;
  return createArtifact({ kind: 'text', name: 'conversion.txt', mime: 'text/plain', data: output, meta: { operation: 'convert', category, from, to, value, result } });
}
