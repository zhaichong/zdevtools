const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fsp = require('fs/promises');
const crypto = require('crypto');
const { startServer } = require('./src/server/index.js');
const { getAdbTargets, startLogcatStream, stopLogcatStream, restartAdb } = require('./src/server/adb.js');

process.on('uncaughtException', (err) => {
    console.error('[main] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[main] unhandledRejection:', reason);
});

let mainWindow;
let localPort;

// app.isPackaged is the reliable way to detect production in electron-builder packaged apps.
// process.env.NODE_ENV is NOT automatically set to 'production' after packaging.
const isDev = !app.isPackaged && process.env.VITE_DEV === 'true';
const RRWEB_MAX_CHUNK_BYTES = 512 * 1024;
const RRWEB_MAX_FILE_BYTES = 20 * 1024 * 1024;

function safeFilePart(value) {
    return String(value || 'unknown').replace(/[^a-z0-9_.-]/gi, '_').slice(0, 120);
}

function rrwebFile(targetId) {
    return path.join(app.getPath('userData'), 'rrweb', `${safeFilePart(targetId)}.jsonl`);
}

function safeJsonLines(text) {
    return text.split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
}

function canOpenAppWindow(rawUrl) {
    try {
        const url = new URL(rawUrl);
        const hostOk = (url.hostname === '127.0.0.1' && String(localPort) === url.port)
            || (isDev && url.hostname === 'localhost' && url.port === '5173');
        return hostOk && ['/workbench.html', '/devtools/inspector.html'].includes(url.pathname);
    } catch {
        return false;
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

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'ztools',
        icon: path.join(__dirname, 'build/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.setMenu(null);

    try {
        localPort = await startServer();
        console.log(`Local backend server started on port ${localPort}`);

        if (isDev) {
            // 开发模式：从 Vite dev server 加载
            mainWindow.loadURL('http://localhost:5173/');
        } else {
            // 生产模式：从本地服务器加载产物，避免 file:/// 导致跨域问题
            mainWindow.loadURL(`http://127.0.0.1:${localPort}/index.html`);
        }

        mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
            console.log(`[Frontend] ${message} (${sourceId}:${line})`);
        });
    } catch (e) {
        dialog.showErrorBox('Server Start Error', e.toString());
    }

    // Auto-Updater：启动时静默检查，事件通过 IPC 转发到渲染进程
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.autoDownload = false; // 改为手动下载，让用户在 UI 中看到进度
    autoUpdater.checkForUpdates().catch(err => {
        console.log('[updater] Startup check skipped or failed:', err.message);
    });

    let currentUpdateState = { type: 'idle' };

    // 将所有 autoUpdater 事件转发到渲染进程并缓存状态
    autoUpdater.on('checking-for-update', () => {
        currentUpdateState = { type: 'checking' };
        mainWindow.webContents.send('update:status', currentUpdateState);
    });
    autoUpdater.on('update-available', (info) => {
        currentUpdateState = {
            type: 'available',
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes
        };
        mainWindow.webContents.send('update:status', currentUpdateState);
    });
    autoUpdater.on('update-not-available', (info) => {
        currentUpdateState = {
            type: 'not-available',
            version: info.version
        };
        mainWindow.webContents.send('update:status', currentUpdateState);
    });
    autoUpdater.on('download-progress', (progress) => {
        currentUpdateState = {
            type: 'download-progress',
            percent: Math.floor(progress.percent),
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total
        };
        mainWindow.webContents.send('update:status', currentUpdateState);
    });
    autoUpdater.on('update-downloaded', (info) => {
        currentUpdateState = {
            type: 'downloaded',
            version: info.version
        };
        mainWindow.webContents.send('update:status', currentUpdateState);
    });
    autoUpdater.on('error', (err) => {
        currentUpdateState = {
            type: 'error',
            message: err ? (err.message || String(err)) : 'Unknown error'
        };
        mainWindow.webContents.send('update:status', currentUpdateState);
    });

    ipcMain.handle('get-update-state', () => currentUpdateState);
}

app.on('web-contents-created', (event, contents) => {
    // Ensure child windows (like workbench opened via window.open) get the same secure settings

    contents.setWindowOpenHandler((details) => {
        if (!canOpenAppWindow(details.url)) return { action: 'deny' };
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    backgroundThrottling: false,
                    preload: path.join(__dirname, 'preload.js')
                }
            }
        };
    });
    
    contents.on('did-create-window', (childWindow) => {
        childWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
            console.log(`[ChildWindow] ${message} (${sourceId}:${line})`);
        });
    });

    // Strip Electron from User-Agent so Chii DevTools frontend loads assets over HTTP instead of devtools://
    const ua = contents.getUserAgent();
    contents.setUserAgent(ua.replace(/Electron\/\S+\s/g, ''));
});

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 优雅关闭：清理 ADB forward 并关闭 HTTP server
app.on('before-quit', async (event) => {
    event.preventDefault();
    try {
        const { runAdb } = require('./src/server/adb.js');
        const { closeServer } = require('./src/server/index.js');
        console.log('[main] before-quit: cleaning up...');
        await runAdb(['forward', '--remove-all']);
        await closeServer();
        console.log('[main] before-quit: cleanup complete');
    } catch (e) {
        console.error('[main] before-quit error:', e);
    }
    app.exit(0);
});

ipcMain.handle('get-targets', async () => {
    return await getAdbTargets();
});

ipcMain.handle('start-logcat', async (event, deviceId) => {
    return await startLogcatStream(deviceId, event.sender);
});

ipcMain.handle('stop-logcat', async (event, deviceId) => {
    stopLogcatStream(deviceId);
    return { status: 'success' };
});

ipcMain.handle('restart-adb', async () => {
    return await restartAdb();
});

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

// ── 在线更新 IPC handlers ──

ipcMain.handle('check-for-update', async () => {
    try {
        const result = await autoUpdater.checkForUpdates();
        return { ok: true, updateInfo: result ? result.updateInfo : null };
    } catch (e) {
        console.error('[updater] check-for-update error:', e.message);
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('download-update', async () => {
    try {
        await autoUpdater.downloadUpdate();
        return { ok: true };
    } catch (e) {
        console.error('[updater] download-update error:', e.message);
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});
