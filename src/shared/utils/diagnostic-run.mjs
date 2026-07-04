const PRIORITY_CONFIDENCE = { P0: 0.92, P1: 0.78, P2: 0.62, P3: 0.42 };

export function toPlainValue(value) {
    const seen = new WeakSet();
    return JSON.parse(JSON.stringify(value, (key, item) => {
        if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'undefined') return undefined;
        if (item && typeof item === 'object') {
            if (seen.has(item)) return '[Circular]';
            seen.add(item);
            if (item instanceof Map) return Object.fromEntries(item);
            if (item instanceof Set) return Array.from(item);
            if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack };
        }
        return item;
    }));
}

export function confidenceForCause(cause = {}) {
    const base = PRIORITY_CONFIDENCE[cause.priority] ?? 0.5;
    const evidenceBoost = Math.min((cause.evidence?.length || 0) * 0.03, 0.12);
    const sourceBoost = cause.source?.mode === 'source-map' ? 0.08 : 0;
    return Math.min(0.98, Number((base + evidenceBoost + sourceBoost).toFixed(2)));
}

export function makeEvidenceEvent(input = {}) {
    const time = input.time || input.lastSeen || input.firstSeen || Date.now();
    const type = input.type || input.kind || 'event';
    const message = input.message || input.title || input.summary || input.url || '';
    return {
        id: input.id || `${type}:${time}:${String(message).slice(0, 80)}`,
        time,
        type,
        source: input.source || 'diagnostic',
        message,
        severity: input.priority || input.severity || '',
        data: input.data || input.raw || input
    };
}

export function normalizeRootCause(cause = {}) {
    return {
        confidence: confidenceForCause(cause),
        directEvidence: (cause.evidence || []).slice(-4),
        ...cause
    };
}

export function buildDiagnosticRun({ runId, target, profile, report }) {
    const causes = (report?.causes || []).map(normalizeRootCause);
    const events = [
        ...(report?.breadcrumbs || []).map(item => makeEvidenceEvent({ ...item, source: item.source || 'breadcrumb' })),
        ...causes.map(cause => makeEvidenceEvent({
            id: `cause:${cause.id}`,
            time: cause.lastSeen,
            type: 'cause',
            source: 'root-cause',
            message: cause.title,
            priority: cause.priority,
            data: cause
        })),
        ...(report?.logcat || []).slice(-120).map((line, index) => makeEvidenceEvent({
            id: `logcat:${index}:${String(line).slice(0, 40)}`,
            type: 'logcat',
            source: 'logcat',
            message: line
        }))
    ].sort((a, b) => (a.time || 0) - (b.time || 0));

    return {
        id: runId,
        createdAt: report?.createdAt || new Date().toISOString(),
        target,
        profile,
        snapshot: report?.snapshot || null,
        sourceMaps: report?.sourceMaps || { uploaded: 0, matched: 0 },
        causes,
        events,
        report: report || null
    };
}
