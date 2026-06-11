import { createArtifact } from '../artifacts.js';
const FIRST = ['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Henry','Iris','Jack','Kate','Leo','Mia','Noah','Olivia'];
const LAST = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Moore','Taylor','Anderson'];
const DOMAINS = ['example.com','test.org','demo.net','mail.co'];
export async function generate(input, settings = {}) {
  const count = settings.count || 10;
  const type = settings.type || 'people';
  const rows = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST[Math.floor(Math.random() * FIRST.length)];
    const last = LAST[Math.floor(Math.random() * LAST.length)];
    const email = (first + '.' + last + '@' + DOMAINS[Math.floor(Math.random() * DOMAINS.length)]).toLowerCase();
    const phone = '+' + Math.floor(Math.random() * 90 + 1) + ' ' + Math.floor(Math.random() * 900 + 100) + ' ' + Math.floor(Math.random() * 9000 + 1000);
    const street = Math.floor(Math.random() * 9000 + 100) + ' ' + ['Main St','Oak Ave','Elm Rd','Pine Ln','Maple Dr'][Math.floor(Math.random() * 5)];
    const city = ['Springfield','Riverside','Lakewood','Hillcrest','Fairview'][Math.floor(Math.random() * 5)];
    rows.push(first + ',' + last + ',' + email + ',' + phone + ',' + street + ',' + city);
  }
  const header = 'firstName,lastName,email,phone,street,city';
  const output = [header, ...rows].join('\n');
  return createArtifact({ kind: 'text', name: 'fake-data.csv', mime: 'text/csv', data: output, meta: { operation: 'generate', count, type } });
}
