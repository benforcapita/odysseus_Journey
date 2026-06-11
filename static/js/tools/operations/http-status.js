import { createArtifact } from '../artifacts.js';
const CODES = {
  100:'Continue',101:'Switching Protocols',200:'OK',201:'Created',202:'Accepted',204:'No Content',206:'Partial Content',
  301:'Moved Permanently',302:'Found',304:'Not Modified',307:'Temporary Redirect',308:'Permanent Redirect',
  400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',405:'Method Not Allowed',408:'Request Timeout',409:'Conflict',410:'Gone',413:'Payload Too Large',414:'URI Too Long',415:'Unsupported Media Type',418:"I'm a teapot",422:'Unprocessable Entity',429:'Too Many Requests',
  500:'Internal Server Error',501:'Not Implemented',502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout'
};
export async function lookup(input, settings = {}) {
  const q = input.trim();
  let results = [];
  const num = parseInt(q, 10);
  if (!isNaN(num) && CODES[num]) {
    results.push(num + ' ' + CODES[num]);
  } else {
    for (const [code, desc] of Object.entries(CODES)) {
      if (code.includes(q) || desc.toLowerCase().includes(q.toLowerCase())) results.push(code + ' ' + desc);
    }
  }
  const output = results.length ? results.join('\n') : 'No matching status codes found.';
  return createArtifact({ kind: 'text', name: 'http-codes.txt', mime: 'text/plain', data: output, meta: { operation: 'lookup', count: results.length } });
}
