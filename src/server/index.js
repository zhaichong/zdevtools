const express = require('express');
const { createServer } = require('http');
const path = require('path');
const { getAdbTargets, getLogcat, restartAdb, findFreePort } = require('./adb.js');
const { createWsProxy, mountWsUpgrade } = require('./proxy.js');
const { requestTimeout, asyncHandler, errorHandler } = require('./middleware.js');

/** @type {import('http').Server|null} */
let httpServer = null;

async function startServer() {
    const app = express();
    const server = createServer(app);
    httpServer = server; // 保存引用供优雅关闭
    const proxy = createWsProxy();

    // 静态资源
    const isDev = !require('electron').app.isPackaged && process.env.VITE_DEV;
    const projectRoot = path.join(__dirname, '..', '..');
    const devtoolsDir = path.join(projectRoot, 'devtools');

    const staticOptions = {
        setHeaders: (res, filePath) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');
            if (filePath.endsWith('.svg')) {
                res.setHeader('Content-Type', 'image/svg+xml');
            }
            if (filePath.includes('devtools')) {
                res.setHeader('Content-Security-Policy',
                    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
                );
            }
        }
    };

    app.use('/devtools', express.static(devtoolsDir, staticOptions));

    const distDir = path.join(projectRoot, 'dist');
    app.use('/', express.static(distDir, staticOptions));
    app.use('/', express.static(devtoolsDir, staticOptions));

    app.use((req, res) => {
        res.status(404).send('Not Found');
    });

    // 全局错误处理
    app.use(errorHandler);

    // WebSocket 代理
    mountWsUpgrade(server, proxy);

    const port = await findFreePort(8999);
    return new Promise(resolve => {
        server.listen(port, () => resolve(port));
    });
}

/**
 * 关闭 HTTP server，返回 Promise 确保优雅关闭完成
 */
function closeServer() {
    return new Promise((resolve) => {
        if (!httpServer) return resolve();
        httpServer.close((err) => {
            if (err) console.error('[server] close error:', err.message);
            resolve();
        });
    });
}

// 保持向后兼容
const { getAdbPath } = require('./adb.js');
module.exports = { startServer, closeServer, getAdbPath, getAdbTargets };
