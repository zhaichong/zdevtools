const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');
const { startServer, closeServer } = require('./src/server/index.js');
const { teardown } = require('./src/server/deviceManager.js');

// 导入解耦的 IPC 模块
const { setupRrwebIpc } = require('./src/main/ipc/rrweb.js');
const { setupDiagnosticIpc } = require('./src/main/ipc/diagnostic.js');
const { setupUpdaterIpc } = require('./src/main/ipc/updater.js');
const { setupDeviceIpc } = require('./src/main/ipc/device.js');

process.on('uncaughtException', (err) => {
    console.error('[main] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[main] unhandledRejection:', reason);
});

let mainWindow;
let localPort;
const proxyCapability = crypto.randomBytes(32).toString('base64url');

const isDev = !app.isPackaged && process.env.VITE_DEV === 'true';

function canOpenAppWindow(rawUrl) {
    try {
        const url = new URL(rawUrl);
        const hostOk = (url.hostname === '127.0.0.1' && String(localPort) === url.port)
            || (isDev && url.hostname === 'localhost' && url.port === '5173');
        return hostOk && ['/devtools/inspector.html'].includes(url.pathname);
    } catch {
        return false;
    }
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
        localPort = await startServer({ proxyCapability });
        console.log(`Local backend server started on port ${localPort}`);

        if (isDev) {
            mainWindow.loadURL('http://localhost:5173/');
        } else {
            mainWindow.loadURL(`http://127.0.0.1:${localPort}/index.html`);
        }

        mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
            console.log(`[Frontend] ${message} (${sourceId}:${line})`);
        });
    } catch (e) {
        dialog.showErrorBox('Server Start Error', e.toString());
    }
}

app.on('web-contents-created', (event, contents) => {
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

    const ua = contents.getUserAgent();
    contents.setUserAgent(ua.replace(/Electron\/\S+\s/g, ''));
});

app.whenReady().then(() => {
    // 注册全局 IPC（只注册一次，避免 macOS activate 时重复注册导致崩溃）
    setupRrwebIpc(ipcMain, app);
    setupDiagnosticIpc(ipcMain, app);
    setupUpdaterIpc(ipcMain, () => mainWindow);
    setupDeviceIpc(ipcMain);
    ipcMain.handle('get-ws-proxy-token', (event) => {
        try {
            const url = new URL(event.senderFrame?.url || event.sender.getURL());
            const isProductionRenderer = url.hostname === '127.0.0.1' && String(localPort) === url.port;
            const isDevelopmentRenderer = isDev && url.hostname === 'localhost' && url.port === '5173';
            return isProductionRenderer || isDevelopmentRenderer ? proxyCapability : '';
        } catch {
            return '';
        }
    });

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

app.on('before-quit', async (event) => {
    event.preventDefault();
    // 超时兜底：清理卡死时（如 USB 断开 adb 不响应）5 秒后强制退出
    const forceTimer = setTimeout(() => {
        console.error('[main] Cleanup timed out after 5s, force exiting');
        app.exit(1);
    }, 5000);

    try {
        console.log('[main] before-quit: cleaning up...');
        await teardown();
        await closeServer();
        console.log('[main] before-quit: cleanup complete');
    } catch (e) {
        console.error('[main] before-quit error:', e);
    }

    clearTimeout(forceTimer);
    app.exit(0);
});
