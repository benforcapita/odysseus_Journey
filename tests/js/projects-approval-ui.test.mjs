import assert from 'node:assert/strict';
import { renderApprovalCardHtml } from '../../static/js/projects.js';

const html = renderApprovalCardHtml({
  pending_id: 'pending-1',
  operation: { tool: 'write_file', summary: 'write app.py', path: 'app.py' },
});

assert.match(html, /Approve/);
assert.match(html, /Reject/);
assert.match(html, /write app\.py/);
assert.match(html, /data-pending-id="pending-1"/);
assert.match(html, /data-project-approval="approve"/);
assert.match(html, /data-project-approval="reject"/);

// Missing operation pieces fall back to safe labels, never undefined.
const minimal = renderApprovalCardHtml({ pending_id: 'pending-2', operation: {} });
assert.match(minimal, /Pending operation/);
assert.match(minimal, /data-pending-id="pending-2"/);

console.log('projects-approval-ui.test.mjs OK');
