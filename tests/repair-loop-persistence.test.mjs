import assert from 'assert';
import { createRequire } from 'module';
import { useReport } from '../src/pages/workbench/composables/useReport.js';

const require = createRequire(import.meta.url);
const { sanitizeDiagnosticPayload } = require('../src/main/ipc/diagnostic.js');

console.log('\nrepair loop persistence tests:');

{
    const payload = sanitizeDiagnosticPayload({
        report: {
            repairLoop: [{
                causeId: 'api:GET:/patients:500',
                status: 'failed',
                attempts: 2,
                baseline: { causeId: 'api:GET:/patients:500', count: 3, createdAt: 1 },
                lastVerification: { status: 'failed', observedCount: 5, verifiedAt: 2 },
                token: 'do-not-persist'
            }]
        }
    });

    const entry = payload.report.repairLoop[0];
    assert.strictEqual(entry.status, 'failed');
    assert.strictEqual(entry.attempts, 2);
    assert.strictEqual(entry.baseline.causeId, 'api:GET:/patients:500');
    assert.strictEqual(entry.token, '[REDACTED]');
}

{
    const payload = sanitizeDiagnosticPayload({ report: { causes: [] } });
    assert.deepStrictEqual(payload.report.repairLoop, undefined);
}

{
    const { fallbackReport } = useReport();
    const report = fallbackReport(
        { url: 'https://app.test/cb?access_token=leak-me', proxyToken: 'capability-secret' },
        null,
        new Error('cdp down'),
        'CDP 连接'
    );
    report.repairLoop = [{
        causeId: 'api:GET:/patients:500',
        status: 'repairing',
        attempts: 1,
        baseline: { causeId: 'api:GET:/patients:500', count: 3, createdAt: 1 },
        lastVerification: null,
        token: 'do-not-persist'
    }];
    const payload = sanitizeDiagnosticPayload({ report });
    assert.strictEqual(payload.report.repairLoop.length, 1);
    assert.strictEqual(payload.report.repairLoop[0].status, 'repairing');
    assert.strictEqual(payload.report.repairLoop[0].causeId, 'api:GET:/patients:500');
    assert.strictEqual(payload.report.repairLoop[0].token, '[REDACTED]');
    assert.equal(payload.report.target.proxyToken, undefined);
    const blob = JSON.stringify(payload);
    assert.ok(!blob.includes('capability-secret'), blob);
    assert.ok(!blob.includes('leak-me'), blob);
    assert.ok(!blob.includes('do-not-persist'), blob);
}

console.log('  -> repair loop persistence tests passed\n');
