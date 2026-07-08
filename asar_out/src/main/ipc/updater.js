const { autoUpdater } = require('electron-updater');
const { app } = require('electron');

function setupUpdaterIpc(ipcMain, getMainWindow) {
    // 仅在开发环境使用 dev update config，避免生产版本指向错误的更新源
    if (!app.isPackaged) {
        autoUpdater.forceDevUpdateConfig = true;
    }
    autoUpdater.autoDownload = false; // 改为手动下载，让用户在 UI 中看到进度
    
    // Auto-Updater：启动时静默检查
    autoUpdater.checkForUpdates().catch(err => {
        console.log('[updater] Startup check skipped or failed:', err.message);
    });

    let currentUpdateState = { type: 'idle' };

    // 辅助函数：安全地向渲染进程发送消息
    const sendToRenderer = (channel, data) => {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, data);
        }
    };

    // 将所有 autoUpdater 事件转发到渲染进程并缓存状态
    autoUpdater.on('checking-for-update', () => {
        currentUpdateState = { type: 'checking' };
        sendToRenderer('update:status', currentUpdateState);
    });
    autoUpdater.on('update-available', (info) => {
        currentUpdateState = {
            type: 'available',
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes
        };
        sendToRenderer('update:status', currentUpdateState);
    });
    autoUpdater.on('update-not-available', (info) => {
        currentUpdateState = {
            type: 'not-available',
            version: info.version
        };
        sendToRenderer('update:status', currentUpdateState);
    });
    autoUpdater.on('download-progress', (progress) => {
        currentUpdateState = {
            type: 'download-progress',
            percent: Math.floor(progress.percent),
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total
        };
        sendToRenderer('update:status', currentUpdateState);
    });
    autoUpdater.on('update-downloaded', (info) => {
        currentUpdateState = {
            type: 'downloaded',
            version: info.version
        };
        sendToRenderer('update:status', currentUpdateState);
    });
    autoUpdater.on('error', (err) => {
        currentUpdateState = {
            type: 'error',
            message: err ? (err.message || String(err)) : 'Unknown error'
        };
        sendToRenderer('update:status', currentUpdateState);
    });

    ipcMain.handle('get-update-state', () => currentUpdateState);

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
}

module.exports = { setupUpdaterIpc };
