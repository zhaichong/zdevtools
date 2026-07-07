const path = require('path');
const fsp = require('fs/promises');
const crypto = require('crypto');
const { safeFilePart, safeJsonLines } = require('./rrweb.js');

function setupDiagnosticIpc(ipcMain, app) {
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
        return {
            ...JSON.parse(metaText),
            events: safeJsonLines(eventText),
            report: reportText ? JSON.parse(reportText) : null
        };
    }

    ipcMain.handle('diagnostic:createRun', async (event, meta = {}) => {
        const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
        const paths = diagnosticPaths(runId);
        const payload = {
            id: runId,
            createdAt: new Date().toISOString(),
            target: meta.target || null,
            profile: meta.profile || null
        };
        await fsp.mkdir(path.dirname(paths.meta), { recursive: true });
        await fsp.writeFile(paths.meta, JSON.stringify(payload, null, 2), 'utf8');
        await fsp.writeFile(paths.events, '', 'utf8');
        return { runId, meta: payload };
    });

    ipcMain.handle('diagnostic:appendEvidence', async (event, runId, payload = {}) => {
        if (!runId) return { ok: false, error: 'runId is required' };
        const paths = diagnosticPaths(runId);
        await fsp.mkdir(path.dirname(paths.meta), { recursive: true });
        const events = Array.isArray(payload.events) ? payload.events : [];
        if (events.length) {
            await fsp.appendFile(paths.events, events.map(item => JSON.stringify(item)).join('\n') + '\n', 'utf8');
        }
        if (payload.report) {
            await fsp.writeFile(paths.report, JSON.stringify(payload.report, null, 2), 'utf8');
        }
        return { ok: true, appended: events.length };
    });

    ipcMain.handle('diagnostic:getRun', async (event, runId) => {
        return readDiagnosticRun(runId);
    });

    ipcMain.handle('diagnostic:exportRun', async (event, runId) => {
        const run = await readDiagnosticRun(runId);
        return run ? JSON.stringify(run, null, 2) : '';
    });
}

module.exports = { setupDiagnosticIpc };
