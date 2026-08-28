import assert from 'assert';
import { createRepairBaseline, verifyRepair } from '../src/shared/utils/repair-loop.mjs';

console.log('\nrepair loop tests:');

const cause = {
    id: 'api:GET:https://example.test/patients:500',
    count: 3,
    lastSeen: 1730000000000,
    priority: 'P0'
};

{
    const baseline = createRepairBaseline(cause, 1730000001000);
    assert.deepStrictEqual(baseline, {
        causeId: cause.id,
        count: 3,
        lastSeen: 1730000000000,
        priority: 'P0',
        createdAt: 1730000001000
    });
}

{
    const { startRepair } = await import('../src/shared/utils/repair-loop.mjs');
    const entry = startRepair(cause, { attempts: 1 }, 1730000001000);
    assert.strictEqual(entry.causeId, cause.id);
    assert.strictEqual(entry.attempts, 2);
}

{
    const result = verifyRepair({ causeId: cause.id, createdAt: 1 }, [] , 2);
    assert.deepStrictEqual(result, {
        status: 'verified',
        verifiedAt: 2,
        observedCount: 0
    });
}

{
    const currentCause = { ...cause, count: 5, lastSeen: 1730000002000 };
    const result = verifyRepair({ causeId: cause.id, createdAt: 1 }, [currentCause], 2);
    assert.deepStrictEqual(result, {
        status: 'failed',
        verifiedAt: 2,
        observedCount: 5,
        lastSeen: 1730000002000
    });
}

{
    const historical = { ...cause, count: 3, lastSeen: 1730000000000 };
    const result = verifyRepair({ causeId: cause.id, createdAt: 1730000001000, count: 3 }, [historical], 2);
    assert.deepStrictEqual(result, {
        status: 'verified',
        verifiedAt: 2,
        observedCount: 3
    });
}

{
    const unknownTime = { ...cause, count: 3, lastSeen: 0 };
    const result = verifyRepair({ causeId: cause.id, createdAt: 1730000001000 }, [unknownTime], 2);
    assert.strictEqual(result.status, 'failed');
}

{
    assert.throws(() => verifyRepair(null, [], 2), /baseline/i);
}

{
    const { partitionCauses, isCausePending, REPAIR_STATUS_LABEL } = await import('../src/shared/utils/repair-loop.mjs');
    const openCause = { id: 'js:boom', title: 'open' };
    const doneCause = { id: 'api:500', title: 'done' };
    const loop = [{ causeId: doneCause.id, status: 'verified' }, { causeId: 'other', status: 'repairing' }];
    const grouped = partitionCauses([doneCause, openCause], loop);
    assert.deepStrictEqual(grouped.pending.map(item => item.id), ['js:boom']);
    assert.deepStrictEqual(grouped.verified.map(item => item.id), ['api:500']);
    assert.deepStrictEqual(grouped.ordered.map(item => item.id), ['js:boom', 'api:500']);
    assert.strictEqual(isCausePending(openCause, loop), true);
    assert.strictEqual(isCausePending(doneCause, loop), false);
    assert.strictEqual(REPAIR_STATUS_LABEL.verified, '已验证');
    assert.strictEqual(REPAIR_STATUS_LABEL.failed, '未通过');
}

console.log('  -> repair loop tests passed\n');
