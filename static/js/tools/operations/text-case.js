import { createArtifact } from '../artifacts.js';
export async function convert(input, settings = {}) {
  const mode = settings.mode || 'lower';
  let output;
  switch (mode) {
    case 'upper': output = input.toUpperCase(); break;
    case 'lower': output = input.toLowerCase(); break;
    case 'title': output = input.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()); break;
    case 'sentence': output = input.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, c => c.toUpperCase()); break;
    case 'camel': output = input.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/^./, c => c.toLowerCase()); break;
    case 'snake': output = input.replace(/\s+/g, '_').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(); break;
    case 'kebab': output = input.replace(/\s+/g, '-').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(); break;
    default: output = input;
  }
  return createArtifact({ kind: 'text', name: 'converted.txt', mime: 'text/plain', data: output, meta: { operation: 'convert', mode } });
}
