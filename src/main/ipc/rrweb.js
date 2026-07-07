const path = require('path');
const fsp = require('fs/promises');

const RRWEB_MAX_CHUNK_BYTES = 512 * 1024;
const RRWEB_MAX_FILE_BYTES = 20 * 1024 * 1024;

function safeFilePart(value) {
    return String(value || 'unknown').replace(/[^a-z0-9_.-]/gi, '_').slice(0, 120);
}

function safeJsonLines(text) {
    return text.split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
}

function setupRrwebIpc(ipcMain, app) {
    function rrwebFile(targetId) {
        return path.join(app.getPath('userData'), 'rrweb', `${safeFilePart(targetId)}.jsonl`);
    }

    ipcMain.handle('save-rrweb-chunk', async (event, targetId, chunk) => {
        try {
            const text = String(chunk || '');
            if (Buffer.byteLength(text, 'utf8') > RRWEB_MAX_CHUNK_BYTES) return false;
            const file = rrwebFile(targetId);
            await fsp.mkdir(path.dirname(file), { recursive: true });
            const size = await fsp.stat(file).then(stat => stat.size).catch(error => {
                if (error.code === 'ENOENT') return 0;
                throw error;
            });
            if (size > RRWEB_MAX_FILE_BYTES) return false;
            await fsp.appendFile(file, text + '\n', 'utf8');
            return true;
        } catch (e) {
            console.error('Failed to save rrweb chunk:', e);
            return false;
        }
    });

    ipcMain.handle('clear-rrweb-chunks', async (event, targetId) => {
        try {
            await fsp.unlink(rrwebFile(targetId)).catch(error => {
                if (error.code !== 'ENOENT') throw error;
            });
            return true;
        } catch (e) {
            console.error('Failed to clear rrweb chunks:', e);
            return false;
        }
    });

    ipcMain.handle('load-rrweb-chunks', async (event, targetId) => {
        try {
            const content = await fsp.readFile(rrwebFile(targetId), 'utf8').catch(error => {
                if (error.code === 'ENOENT') return '';
                throw error;
            });
            return safeJsonLines(content);
        } catch (e) {
            console.error('Failed to load rrweb chunks:', e);
            return [];
        }
    });
}

module.exports = { setupRrwebIpc, safeFilePart, safeJsonLines };
