const path = require('path');
const fsp = require('fs/promises');
const { safeFilePart, safeJsonLines } = require('../utils.js');
const { redact } = require('../../shared/utils/redact-rules.cjs');

const RRWEB_MAX_CHUNK_BYTES = 512 * 1024;
const RRWEB_MAX_FILE_BYTES = 20 * 1024 * 1024;

function createBoundedChunkQueue({ maxBytes, readSize, append, clear }) {
    const entries = new Map();

    function entryFor(key) {
        if (!entries.has(key)) entries.set(key, { tail: Promise.resolve(), size: null, reservedBytes: 0 });
        return entries.get(key);
    }

    function enqueue(key, operation) {
        const entry = entryFor(key);
        const task = entry.tail.then(() => operation(entry));
        entry.tail = task.catch(() => {});
        return task;
    }

    return {
        append(key, text) {
            const entry = entryFor(key);
            const byteLength = Buffer.byteLength(text, 'utf8');
            // Reserve before creating a queued Promise. A hostile target can emit events
            // faster than disk I/O; this bounds both the file and the in-memory backlog.
            if (entry.reservedBytes + byteLength > maxBytes) return Promise.resolve(false);
            entry.reservedBytes += byteLength;
            return enqueue(key, async (entry) => {
                try {
                    if (entry.size == null) entry.size = await readSize(key);
                    if (entry.size + byteLength > maxBytes) return false;
                    await append(key, text);
                    entry.size += byteLength;
                    return true;
                } finally {
                    entry.reservedBytes -= byteLength;
                }
            });
        },
        clear(key) {
            return enqueue(key, async (entry) => {
                await clear(key);
                entry.size = 0;
                return true;
            });
        }
    };
}

function sanitizeRrwebChunk(rawText) {
    let event;
    try { event = JSON.parse(rawText); } catch (e) { return null; }
    const safeAttributes = new Set(['class', 'style', 'type', 'role']);
    const visit = (value, key = '') => {
        if (Array.isArray(value)) return value.map(item => visit(item));
        if (!value || typeof value !== 'object') {
            return /^(?:textContent|text|value)$/i.test(key) && typeof value === 'string' ? '[MASKED]' : value;
        }
        for (const [childKey, childValue] of Object.entries(value)) {
            if (/^(?:textContent|text|value)$/i.test(childKey) && typeof childValue === 'string') {
                value[childKey] = '[MASKED]';
            } else if (childKey === 'attributes' && childValue && typeof childValue === 'object') {
                for (const attribute of Object.keys(childValue)) {
                    if (!safeAttributes.has(attribute.toLowerCase())) childValue[attribute] = '[MASKED]';
                }
            } else {
                value[childKey] = visit(childValue, childKey);
            }
        }
        return value;
    };
    return redact(JSON.stringify(visit(event)));
}

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

    const writeQueue = createBoundedChunkQueue({
        maxBytes: RRWEB_MAX_FILE_BYTES,
        readSize: async (file) => fsp.stat(file).then(stat => stat.size).catch(error => {
            if (error.code === 'ENOENT') return 0;
            throw error;
        }),
        append: (file, text) => fsp.appendFile(file, text, 'utf8'),
        clear: async (file) => {
            await fsp.unlink(file).catch(error => {
                if (error.code !== 'ENOENT') throw error;
            });
        }
    });

    ipcMain.handle('save-rrweb-chunk', async (event, targetId, chunk) => {
        try {
            const rawText = String(chunk || '');
            if (Buffer.byteLength(rawText, 'utf8') > RRWEB_MAX_CHUNK_BYTES) return false;
            const text = sanitizeRrwebChunk(rawText);
            if (!text) return false;
            const file = rrwebFile(targetId);
            await fsp.mkdir(path.dirname(file), { recursive: true });
            return writeQueue.append(file, text + '\n');
        } catch (e) {
            console.error('Failed to save rrweb chunk:', e);
            return false;
        }
    });

    ipcMain.handle('clear-rrweb-chunks', async (event, targetId) => {
        try {
            return await writeQueue.clear(rrwebFile(targetId));
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

module.exports = { setupRrwebIpc, createBoundedChunkQueue, sanitizeRrwebChunk };
