import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const assert = require('assert');
const { sanitizeDiagnosticPayload, sanitizeDiagnosticValue, createRunWriteQueue } = require('../src/main/ipc/diagnostic.js');
const { sanitizeLogChunk } = require('../src/server/drivers/baseDriver.js');

const payload = sanitizeDiagnosticPayload({
    events: [{
        id: 'event-1',
        message: 'Authorization: Bearer top-secret-token',
        data: { requestHeaders: { Authorization: 'Bearer top-secret-token' } }
    }],
    report: {
        snapshot: {
            storage: {
                local: { patientInfo: '{"name":"Alice","token":"top-secret-token"}' },
                session: { loginInfo: '{"password":"hunter2"}' }
            }
        },
        events: [{ message: 'token=top-secret-token' }]
    }
});

const persisted = JSON.stringify(payload);
assert.equal(persisted.includes('top-secret-token'), false);
assert.equal(persisted.includes('hunter2'), false);
assert.equal(persisted.includes('Alice'), false);
assert.deepStrictEqual(payload.report.snapshot.storage, { localKeys: ['patientInfo'], sessionKeys: ['loginInfo'] });

assert.equal(
    sanitizeDiagnosticValue({ url: 'https://example.test/?access_token=top-secret-token' }).url.includes('top-secret-token'),
    false
);
assert.equal(sanitizeDiagnosticValue({ auth: 'super-secret-value' }).auth, '[REDACTED]');
assert.equal(sanitizeDiagnosticValue({ author: 'alice' }).author, 'alice');

const queue = createRunWriteQueue();
const writes = [];
await Promise.all([
    queue('same-run', async () => { await new Promise(resolve => setTimeout(resolve, 10)); writes.push('first'); }),
    queue('same-run', async () => { writes.push('second'); })
]);
assert.deepStrictEqual(writes, ['first', 'second'], 'writes for one diagnostic run must be serialized');

assert.ok(!sanitizeLogChunk('E/WebView: auth=super-secret-value keep=ok').includes('super-secret-value'));
assert.match(sanitizeLogChunk('E/WebView: auth=super-secret-value keep=ok'), /keep=ok/);

console.log('diagnostic persistence tests passed');
