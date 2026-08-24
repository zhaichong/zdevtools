const express = require('express');
const { createServer } = require('http');
const path = require('path');
const { findFreePort } = require('./portfinder.js');
const { createWsProxy, mountWsUpgrade, closeAllSockets } = require('./proxy.js');
const { errorHandler } = require('./middleware.js');

/** @type {import('http').Server|null} */
let httpServer = null;

async function startServer({ proxyCapability } = {}) {
    if (typeof proxyCapability !== 'string' || proxyCapability.length < 32) {
        throw new Error('A strong WebSocket proxy capability is required');
    }
    const app = express();
    const server = createServer(app);
    httpServer = server; // 保存引用供优雅关闭
    const proxy = createWsProxy();

    // 静态资源
    const projectRoot = path.join(__dirname, '..', '..');
    const devtoolsDir = path.join(projectRoot, 'devtools');

    const staticOptions = {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.svg')) {
                res.setHeader('Content-Type', 'image/svg+xml');
            }
            if (filePath.includes('devtools')) {
                res.setHeader('Content-Security-Policy',
                    "default-src 'self' http://127.0.0.1:* ws://127.0.0.1:* data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:*; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://127.0.0.1:*; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*"
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
    mountWsUpgrade(server, proxy, proxyCapability);

    const port = await findFreePort(8999);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(port));
    });
}

/**
 * 关闭 HTTP server，返回 Promise 确保优雅关闭完成
 */
function closeServer() {
    return new Promise((resolve) => {
        closeAllSockets();
        if (!httpServer) return resolve();
        httpServer.close((err) => {
            if (err) console.error('[server] close error:', err.message);
            resolve();
        });
    });
}

module.exports = { startServer, closeServer };
