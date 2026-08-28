export function createRepairBaseline(cause, createdAt = Date.now()) {
    if (!cause?.id) throw new Error('A cause with an id is required to create a baseline');
    return {
        causeId: cause.id,
        count: Number(cause.count) || 0,
        lastSeen: Number(cause.lastSeen) || 0,
        priority: cause.priority || 'P1',
        createdAt
    };
}

export function verifyRepair(baseline, causes, verifiedAt = Date.now()) {
    if (!baseline?.causeId) throw new Error('A baseline is required to verify a repair');
    const current = (Array.isArray(causes) ? causes : []).find(cause => cause?.id === baseline.causeId);
    if (!current) {
        return { status: 'verified', verifiedAt, observedCount: 0 };
    }
    const observedLastSeen = Number(current.lastSeen) || 0;
    const observedCount = Number(current.count) || 0;
    const baselineCreatedAt = Number(baseline.createdAt) || 0;
    // Session buffers keep historical events. Only a sighting after the baseline
    // counts as still reproducing; lastSeen=0 means we cannot tell, so fail closed.
    const recurred = observedLastSeen === 0 || observedLastSeen > baselineCreatedAt;
    if (!recurred) {
        return { status: 'verified', verifiedAt, observedCount };
    }
    return {
        status: 'failed',
        verifiedAt,
        observedCount,
        lastSeen: observedLastSeen
    };
}

export function startRepair(cause, previous = null, now = Date.now()) {
    return {
        causeId: cause.id,
        status: 'repairing',
        attempts: (Number(previous?.attempts) || 0) + 1,
        baseline: createRepairBaseline(cause, now),
        lastVerification: null
    };
}

export const REPAIR_STATUS_LABEL = {
    repairing: '修复中',
    verifying: '复验中',
    verified: '已验证',
    failed: '未通过'
};

export function repairEntryFor(repairLoop, causeId) {
    if (!causeId) return null;
    return (Array.isArray(repairLoop) ? repairLoop : []).find(entry => entry?.causeId === causeId) || null;
}

export function isCausePending(cause, repairLoop) {
    return repairEntryFor(repairLoop, cause?.id)?.status !== 'verified';
}

export function partitionCauses(causes, repairLoop) {
    const pending = [];
    const verified = [];
    for (const cause of Array.isArray(causes) ? causes : []) {
        if (repairEntryFor(repairLoop, cause?.id)?.status === 'verified') verified.push(cause);
        else pending.push(cause);
    }
    return { pending, verified, ordered: [...pending, ...verified] };
}
