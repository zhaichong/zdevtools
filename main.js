const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { startServer } = require('./src/server/index.js');
const { getAdbTargets, getLogcat, restartAdb } = require('./src/server/adb.js');

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

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Local Inspect',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
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

        mainWindow.webContents.openDevTools();
        mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
            console.log(`[Frontend] ${message} (${sourceId}:${line})`);
        });
    } catch (e) {
        dialog.showErrorBox('Server Start Error', e.toString());
    }

    // Auto-Updater logic
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-available', () => {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Found Updates',
            message: 'A new version is available. Downloading now...'
        });
    });

    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Ready',
            message: 'A new version has been downloaded. Restart the application to apply the updates.',
            buttons: ['Restart', 'Later']
        }).then((returnValue) => {
            if (returnValue.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    autoUpdater.on('error', (err) => {
        console.error('AutoUpdater Error:', err);
    });
}

app.on('web-contents-created', (event, contents) => {
    // Strip Electron from User-Agent so Chii DevTools frontend loads assets over HTTP instead of devtools://
    const ua = contents.getUserAgent();
    contents.setUserAgent(ua.replace(/Electron\/\S+\s/g, ''));
});

app.whenReady().then(createWindow);

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

ipcMain.handle('get-targets', async () => {
    return await getAdbTargets();
});

ipcMain.handle('get-logcat', async (event, deviceId) => {
    return await getLogcat(deviceId);
});

ipcMain.handle('restart-adb', async () => {
    return await restartAdb();
});
