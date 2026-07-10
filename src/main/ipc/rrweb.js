const path = require('path');
const fsp = require('fs/promises');
const { safeFilePart, safeJsonLines } = require('../utils.js');

const RRWEB_MAX_CHUNK_BYTES = 512 * 1024;
const RRWEB_MAX_FILE_BYTES = 20 * 1024 * 1024;

function setupRrwebIpc(ipcMain, app) {
    async function cleanupOldChunks() {
        try {
            const dir = path.join(app.getPath('userData'), 'rrweb');
            const files = await fsp.readdir(dir).catch(() => []);
            if (!files.length) return;
            
            const chunkFiles = await Promise.all(files.filter(f => f.endsWith('.jsonl')).map(async f => {
                const stat = await fsp.stat(path.join(dir, f)).catch(() => null);
                return { name: f, mtime: stat ? stat.mtimeMs : 0 };
            }));
            
            chunkFiles.sort((a, b) => b.mtime - a.mtime);
            const toDelete = chunkFiles.slice(10);
            
            for (const file of toDelete) {
                await fsp.unlink(path.join(dir, file.name)).catch(() => {});
            }
        } catch (e) {
            console.error('[rrweb] cleanup failed:', e);
        }
    }

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

    cleanupOldChunks();
}

module.exports = { setupRrwebIpc };
