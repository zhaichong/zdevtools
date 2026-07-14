const { autoUpdater } = require('electron-updater');
const { app } = require('electron');

function setupUpdaterIpc(ipcMain, getMainWindow) {
    // 仅在开发环境使用 dev update config，避免生产版本指向错误的更新源
    if (!app.isPackaged) {
        autoUpdater.forceDevUpdateConfig = true;
    }
    autoUpdater.autoDownload = false; // 改为手动下载，让用户在 UI 中看到进度
    autoUpdater.disableDifferentialDownload = true; // 禁用差分下载，使用全量安装包以保证最高稳定性

    let isManualCheck = false; // 标记是否为手动点击检查更新
    let currentUpdateState = { type: 'idle' };

    // Auto-Updater：启动时静默检查
    isManualCheck = false;
    autoUpdater.checkForUpdates().catch(err => {
        console.log('[updater] Startup check skipped or failed:', err.message);
    });

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
        if (isManualCheck) {
            sendToRenderer('update:status', currentUpdateState);
        }
    });

    autoUpdater.on('update-available', (info) => {
        currentUpdateState = {
            type: 'available',
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes
        };
        sendToRenderer('update:status', currentUpdateState);
        isManualCheck = false; // 找到更新后重置状态
    });

    autoUpdater.on('update-not-available', (info) => {
        currentUpdateState = {
            type: 'not-available',
            version: info.version
        };
        if (isManualCheck) {
            sendToRenderer('update:status', currentUpdateState);
        }
        isManualCheck = false; // 重置状态
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
        console.error('[updater] autoUpdater error:', err ? (err.message || String(err)) : 'Unknown error');
        if (isManualCheck) {
            currentUpdateState = {
                type: 'error',
                message: err ? (err.message || String(err)) : 'Unknown error'
            };
            sendToRenderer('update:status', currentUpdateState);
        }
        isManualCheck = false; // 重置状态
    });

    ipcMain.handle('get-update-state', () => currentUpdateState);

    ipcMain.handle('check-for-update', async () => {
        try {
            isManualCheck = true; // 用户手动触发
            const result = await autoUpdater.checkForUpdates();
            return { ok: true, updateInfo: result ? result.updateInfo : null };
        } catch (e) {
            console.error('[updater] check-for-update error:', e.message);
            isManualCheck = false;
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

    ipcMain.handle('install-local-package', async () => {
        const { dialog } = require('electron');
        const { spawn } = require('child_process');
        const win = getMainWindow();
        
        try {
            const result = await dialog.showOpenDialog(win, {
                title: '选择本地安装包升级',
                filters: [
                    { name: 'Windows 安装包', extensions: ['exe'] }
                ],
                properties: ['openFile']
            });
            
            if (result.canceled || result.filePaths.length === 0) {
                return { ok: false, error: 'Cancelled' };
            }
            
            const filePath = result.filePaths[0];
            console.log('[updater] Launching local installer:', filePath);
            
            // 独立启动进程并立即退出主应用，避免安装程序因为文件占用报错
            const child = spawn(filePath, [], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            app.quit();
            return { ok: true };
        } catch (e) {
            console.error('[updater] install-local-package error:', e.message);
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
