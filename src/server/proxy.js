const { createProxyServer } = require('http-proxy');

function isAllowedProxyTarget(port, path) {
    const n = Number(port);
    return Number.isInteger(n)
        && n >= 9220
        && n <= 9399
        && /^\/devtools\/page\/[A-Za-z0-9_.:-]+$/.test(path);
}


/**
 * 创建 WebSocket 代理并返回 proxy 实例
 */
function createWsProxy() {
    const proxy = createProxyServer({ ws: true, changeOrigin: true, timeout: 0, proxyTimeout: 0 });

    proxy.on('error', (err, req, res) => {
        console.error('[ws-proxy] error:', err.message);
        if (res && res.writeHead) {
            res.writeHead(500);
            res.end('Proxy Error');
        } else if (res && res.destroy) {
            res.destroy();
        }
    });

    proxy.on('proxyReqWs', (proxyReq) => {
        proxyReq.removeHeader('origin');
    });

    proxy.on('open', (proxySocket) => {
        proxySocket.setKeepAlive(true, 30000);
        proxySocket.on('close', () => console.log('[ws-proxy] upstream closed'));
        proxySocket.on('error', err => console.error('[ws-proxy] upstream error:', err.message));
    });

    return proxy;
}

/**
 * 挂载 upgrade 事件到 HTTP server
 * @param {import('http').Server} server
 * @param {import('http-proxy').ProxyServer} proxy
 */
function mountWsUpgrade(server, proxy) {
    server.on('upgrade', (req, socket, head) => {
        const match = req.url.match(/^\/ws-proxy\/(\d+)(.*)/);
        if (match) {
            const port = match[1];
            const path = match[2];
            if (!isAllowedProxyTarget(port, path)) {
                socket.destroy();
                return;
            }
            socket.setKeepAlive(true, 30000);
            socket.on('close', () => console.log(`[ws-proxy] client closed ${port}${path}`));
            socket.on('error', err => console.error('[ws-proxy] client error:', err.message));
            req.url = path;
            proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        } else {
            socket.destroy();
        }
    });
}

module.exports = { createWsProxy, mountWsUpgrade, isAllowedProxyTarget };
