import { createRequire } from 'module';
import { buildDiagnosticRun, confidenceForCause, makeEvidenceEvent, toPlainValue } from '../src/shared/utils/diagnostic-run.mjs';

const require = createRequire(import.meta.url);
const assert = require('assert');
const { isAllowedProxyTarget } = require('../src/server/proxy.js');

const p0 = { id: 'api:500', priority: 'P0', title: 'API 500', evidence: [{ status: 500 }] };
assert.equal(confidenceForCause(p0) >= 0.9, true);

const event = makeEvidenceEvent({ type: 'network', time: 10, message: 'GET /api failed' });
assert.equal(event.id.startsWith('network:10:'), true);
assert.equal(event.source, 'diagnostic');

const run = buildDiagnosticRun({
    runId: 'run-1',
    target: { targetId: 'page-1' },
    profile: { id: 'demo' },
    report: {
        createdAt: '2026-01-01T00:00:00.000Z',
        causes: [p0],
        breadcrumbs: [{ time: 1, type: 'click', message: 'Save' }],
        logcat: ['E/WebView: boom'],
        sourceMaps: { uploaded: 1, matched: 0 }
    }
});

assert.equal(run.id, 'run-1');
assert.equal(run.causes[0].confidence >= 0.9, true);
assert.equal(run.events.some(item => item.type === 'cause'), true);
assert.equal(run.events.some(item => item.type === 'logcat'), true);

const circular = { ok: 1, skip: Symbol('nope'), fn() {} };
circular.self = circular;
const plain = toPlainValue({
    circular,
    map: new Map([['a', 1]]),
    set: new Set(['x'])
});
assert.deepStrictEqual(plain.circular, { ok: 1, self: '[Circular]' });
assert.deepStrictEqual(plain.map, { a: 1 });
assert.deepStrictEqual(plain.set, ['x']);

assert.equal(isAllowedProxyTarget('9220', '/devtools/page/ABC_123'), true);
assert.equal(isAllowedProxyTarget('8999', '/devtools/page/ABC_123'), false);
assert.equal(isAllowedProxyTarget('9220', '/anything'), false);

console.log('diagnostic-run tests passed');
