import { createArtifact } from '../artifacts.js';
function simpleYamlToJson(yaml) {
  // Extremely simplified YAML parser for flat objects and shallow nesting
  const result = {};
  let currentKey = null;
  let currentObj = result;
  const lines = yaml.split('\n');
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);
    if (indent === 0) {
      const m = line.match(/^([^:]+):\s*(.*)/);
      if (m) {
        currentKey = m[1].trim();
        const val = m[2].trim();
        if (val === '' || val === '{}' || val === '[]') {
          const nextIsIndented = lines.some(l => l.search(/\S/) > 0 && l.trim().startsWith('-'));
          currentObj[currentKey] = val === '[]' || nextIsIndented ? [] : {};
        } else {
          currentObj[currentKey] = val;
        }
      }
    } else if (indent > 0 && currentKey) {
      const m = line.trim().match(/^-\s*(.*)/);
      if (m) {
        if (!Array.isArray(currentObj[currentKey])) currentObj[currentKey] = [];
        currentObj[currentKey].push(m[1].trim());
      } else {
        const m2 = line.trim().match(/^([^:]+):\s*(.*)/);
        if (m2 && typeof currentObj[currentKey] === 'object' && !Array.isArray(currentObj[currentKey])) {
          currentObj[currentKey][m2[1].trim()] = m2[2].trim();
        }
      }
    }
  }
  return JSON.stringify(result, null, 2);
}
function simpleJsonToYaml(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(key + ':');
      value.forEach(v => lines.push('  - ' + v));
    } else if (typeof value === 'object' && value !== null) {
      lines.push(key + ':');
      for (const [k, v] of Object.entries(value)) lines.push('  ' + k + ': ' + v);
    } else {
      lines.push(key + ': ' + value);
    }
  }
  return lines.join('\n');
}
export async function yamlToJson(input, settings = {}) {
  const output = simpleYamlToJson(input);
  return createArtifact({ kind: 'text', name: 'output.json', mime: 'application/json', data: output, meta: { operation: 'yaml-to-json' } });
}
export async function jsonToYaml(input, settings = {}) {
  const output = simpleJsonToYaml(input);
  return createArtifact({ kind: 'text', name: 'output.yaml', mime: 'text/yaml', data: output, meta: { operation: 'json-to-yaml' } });
}
