const path = require('path');
const fsp = require('fs/promises');
const crypto = require('crypto');
const { safeFilePart, safeJsonLines } = require('../utils.js');
const { redact } = require('../../shared/utils/redact-rules.cjs');

const DIAGNOSTIC_MAX_EVENTS_PER_APPEND = 5000;  // 鍗曟 append 鏈€澶?5000 鏉′簨浠?
const DIAGNOSTIC_MAX_FILE_BYTES = 50 * 1024 * 1024;  // JSONL 鏂囦欢鏈€澶?50MB
const SENSITIVE_FIELD_RE = /(?:access_)?token|password|client_secret|api_?key|secret|private_?key|^auth$|authorization|cookie|session|patient|login/i;

function sanitizeDiagnosticValue(value, key = '') {
    if (SENSITIVE_FIELD_RE.test(key)) return '[REDACTED]';
    if (typeof value === 'string') return redact(value);
    if (Array.isArray(value)) return value.map(item => sanitizeDiagnosticValue(item));
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeDiagnosticValue(childValue, childKey)
    ]));
}

function sanitizeDiagnosticPayload(payload = {}) {
    const report = sanitizeDiagnosticValue(payload.report || {});
    if (report.snapshot?.storage) {
        const storage = payload.report?.snapshot?.storage || {};
        report.snapshot.storage = {
            localKeys: Object.keys(storage.local || {}),
            sessionKeys: Object.keys(storage.session || {})
        };
    }
    return {
        events: sanitizeDiagnosticValue(Array.isArray(payload.events) ? payload.events : []),
        report
    };
}

function createRunWriteQueue() {
    const tails = new Map();
    return (runId, work) => {
        const previous = tails.get(runId) || Promise.resolve();
        const task = previous.catch(() => {}).then(work);
        tails.set(runId, task);
        task.then(
            () => { if (tails.get(runId) === task) tails.delete(runId); },
            () => { if (tails.get(runId) === task) tails.delete(runId); }
        );
        return task;
    };
}

function setupDiagnosticIpc(ipcMain, app) {
    const enqueueRunWrite = createRunWriteQueue();
    async function cleanupOldRuns() {
        try {
            const dir = diagnosticDir();
            const files = await fsp.readdir(dir).catch(() => []);
            if (!files.length) return;
            
            const metaFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.report.json'));
            const runs = await Promise.all(metaFiles.map(async f => {
                const stat = await fsp.stat(path.join(dir, f)).catch(() => null);
                return { name: f, id: f.replace('.json', ''), mtime: stat ? stat.mtimeMs : 0 };
            }));
            
            runs.sort((a, b) => b.mtime - a.mtime);
            const toKeep = new Set(runs.slice(0, 20).map(r => r.id));
            
            for (const file of files) {
                const isReport = file.endsWith('.report.json');
                const isEvents = file.endsWith('.jsonl');
                const isMeta = file.endsWith('.json') && !isReport;
                
                let idMatch = '';
                if (isReport) idMatch = file.replace('.report.json', '');
                else if (isEvents) idMatch = file.replace('.jsonl', '');
                else if (isMeta) idMatch = file.replace('.json', '');
                else continue;
                
                if (!toKeep.has(idMatch)) {
                    await fsp.unlink(path.join(dir, file)).catch(() => {});
                }
            }
        } catch (e) {
            console.error('[diagnostic] cleanup failed:', e);
        }
    }

    function diagnosticDir() {
        return path.join(app.getPath('userData'), 'diagnostics');
    }

    function diagnosticPaths(runId) {
        const id = safeFilePart(runId);
        const dir = diagnosticDir();
        return {
            meta: path.join(dir, `${id}.json`),
            events: path.join(dir, `${id}.jsonl`),
            report: path.join(dir, `${id}.report.json`)
        };
    }

    async function readDiagnosticRun(runId) {
        if (!runId) return null;
        return enqueueRunWrite(runId, async () => {
            const paths = diagnosticPaths(runId);
            const metaText = await fsp.readFile(paths.meta, 'utf8').catch(error => {
                if (error.code === 'ENOENT') return '';
                throw error;
            });
            if (!metaText) return null;
            const eventText = await fsp.readFile(paths.events, 'utf8').catch(error => {
                if (error.code === 'ENOENT') return '';
                throw error;
            });
            const reportText = await fsp.readFile(paths.report, 'utf8').catch(error => {
                if (error.code === 'ENOENT') return '';
                throw error;
            });
            let meta, report;
            try { meta = JSON.parse(metaText); } catch (e) { meta = null; }
            try { report = reportText ? JSON.parse(reportText) : null; } catch (e) { report = null; }
            return {
                ...(meta || { id: runId, error: 'Corrupted meta file' }),
                events: safeJsonLines(eventText),
                report
            };
        });
    }

    ipcMain.handle('diagnostic:createRun', async (event, meta = {}) => {
        const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
        const paths = diagnosticPaths(runId);
        const payload = {
            id: runId,
            createdAt: new Date().toISOString(),
            target: sanitizeDiagnosticValue(meta.target || null),
            profile: sanitizeDiagnosticValue(meta.profile || null)
        };
        await fsp.mkdir(path.dirname(paths.meta), { recursive: true });
        await fsp.writeFile(paths.meta, JSON.stringify(payload, null, 2), 'utf8');
        await fsp.writeFile(paths.events, '', 'utf8');
        return { runId, meta: payload };
    });

    ipcMain.handle('diagnostic:appendEvidence', async (event, runId, payload = {}) => {
        if (!runId) return { ok: false, error: 'runId is required' };
        const paths = diagnosticPaths(runId);
        const sanitized = sanitizeDiagnosticPayload(payload);
        const events = sanitized.events;
        
        // 闄愬埗鍗曟 append 鐨勪簨浠舵暟閲?
        if (events.length > DIAGNOSTIC_MAX_EVENTS_PER_APPEND) {
            return { ok: false, error: `Too many events (max ${DIAGNOSTIC_MAX_EVENTS_PER_APPEND} per append)` };
        }
        
        return enqueueRunWrite(runId, async () => {
            await fsp.mkdir(path.dirname(paths.meta), { recursive: true });
            if (events.length) {
                // This check and the append must share the same per-run queue.
                const currentSize = await fsp.stat(paths.events).then(stat => stat.size).catch(() => 0);
                const newContent = events.map(item => JSON.stringify(item)).join('\n') + '\n';
                const newSize = Buffer.byteLength(newContent, 'utf8');
                if (currentSize + newSize > DIAGNOSTIC_MAX_FILE_BYTES) {
                    return { ok: false, error: `Diagnostic file would exceed ${DIAGNOSTIC_MAX_FILE_BYTES} bytes limit` };
                }
                await fsp.appendFile(paths.events, newContent, 'utf8');
            }
            if (payload.report) {
                const temporaryReport = `${paths.report}.${crypto.randomBytes(6).toString('hex')}.tmp`;
                await fsp.writeFile(temporaryReport, JSON.stringify(sanitized.report, null, 2), 'utf8');
                await fsp.rename(temporaryReport, paths.report);
            }
            return { ok: true, appended: events.length };
        });
    });

    ipcMain.handle('diagnostic:getRun', async (event, runId) => {
        return readDiagnosticRun(runId);
    });

    ipcMain.handle('diagnostic:exportRun', async (event, runId) => {
        const run = await readDiagnosticRun(runId);
        return run ? JSON.stringify(run, null, 2) : '';
    });

    cleanupOldRuns();
}

module.exports = { setupDiagnosticIpc, sanitizeDiagnosticPayload, sanitizeDiagnosticValue, createRunWriteQueue };
