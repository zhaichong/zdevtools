const { createProxyServer } = require('http-proxy');

/**
 * 创建 WebSocket 代理并返回 proxy 实例
 */
function createWsProxy() {
    const proxy = createProxyServer({ ws: true, changeOrigin: true });

    proxy.on('error', (err, req, res) => {
        console.error('[ws-proxy] error:', err.message);
        if (res && res.writeHead) {
            res.writeHead(500);
            res.end('Proxy Error');
        }
    });

    proxy.on('proxyReqWs', (proxyReq) => {
        proxyReq.removeHeader('origin');
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
            req.url = match[2];
            proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        } else {
            socket.destroy();
        }
    });
}

module.exports = { createWsProxy, mountWsUpgrade };
