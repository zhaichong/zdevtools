const { createProxyServer } = require('http-proxy');
const crypto = require('crypto');
const { FORWARD_PORT_MIN, FORWARD_PORT_MAX } = require('./constants.js');

function isAllowedProxyTarget(port, path) {
    const n = Number(port);
    if (!Number.isInteger(n) || n < FORWARD_PORT_MIN || n > FORWARD_PORT_MAX) {
        return false;
    }
    if (typeof path !== 'string') {
        return false;
    }
    // 严格限制为单页面级调试路径 /devtools/page/<targetId>，严格禁止 /devtools/browser 等高权限越权端点
    return /^\/devtools\/page\/[A-Za-z0-9_.:\-@%]+(?:\?[A-Za-z0-9_.:\-@%&=~+#]*)?$/i.test(path);
}

function hasValidCapability(provided, expected) {
    if (typeof provided !== 'string' || typeof expected !== 'string') return false;
    const actual = Buffer.from(provided);
    const required = Buffer.from(expected);
    return actual.length === required.length && crypto.timingSafeEqual(actual, required);
}

function extractAuthorizedProxyRequest(rawUrl, capability) {
    if (!capability) return null;
    let url;
    try {
        url = new URL(rawUrl, 'http://127.0.0.1');
    } catch {
        return null;
    }
    const match = url.pathname.match(/^\/ws-proxy\/(\d+)(\/.*)$/);
    if (!match || !hasValidCapability(url.searchParams.get('ztools_token'), capability)) return null;

    url.searchParams.delete('ztools_token');
    const target = { port: match[1], path: match[2] + url.search };
    return isAllowedProxyTarget(target.port, target.path) ? target : null;
}

const activeSockets = new Set();

/**
 * 创建 WebSocket 代理并返回 proxy 实例
 */
function createWsProxy() {
    const proxy = createProxyServer({ ws: true, changeOrigin: true, timeout: 0, proxyTimeout: 0 });

    proxy.on('error', (err, req, resOrSocket) => {
        console.error('[ws-proxy] error:', err.message);
        if (resOrSocket) {
            if (typeof resOrSocket.writeHead === 'function') {
                try {
                    resOrSocket.writeHead(502);
                    resOrSocket.end('Bad Gateway: Proxy Error');
                } catch (e) {}
            } else if (typeof resOrSocket.destroy === 'function') {
                try {
                    resOrSocket.destroy();
                } catch (e) {}
            }
        }
    });

    proxy.on('proxyReqWs', (proxyReq, req, socket, options) => {
        // 移除 origin，避免 Chromium CDP 因 Origin 不匹配拒绝连接 (403 Forbidden)
        proxyReq.removeHeader('origin');
        // 显式重写 host 为目标端口，满足 Chromium 的 Host header 白名单检查
        const targetPort = options?.target?.port || (req.url && (req.url.match(/^\/ws-proxy\/(\d+)/) || [])[1]);
        if (targetPort) {
            proxyReq.setHeader('host', `127.0.0.1:${targetPort}`);
        }
    });

    proxy.on('open', (proxySocket) => {
        activeSockets.add(proxySocket);
        proxySocket.setKeepAlive(true, 30000);
        proxySocket.on('close', () => {
            activeSockets.delete(proxySocket);
            console.log('[ws-proxy] upstream closed');
        });
        proxySocket.on('error', err => {
            activeSockets.delete(proxySocket);
            console.error('[ws-proxy] upstream error:', err.message);
        });
    });

    return proxy;
}

/**
 * 挂载 upgrade 事件到 HTTP server
 * @param {import('http').Server} server
 * @param {import('http-proxy').ProxyServer} proxy
 */
function mountWsUpgrade(server, proxy, capability) {
    server.on('upgrade', (req, socket, head) => {
        const target = extractAuthorizedProxyRequest(req.url, capability);
        if (target) {
            const { port, path } = target;
            if (!isAllowedProxyTarget(port, path)) {
                console.warn(`[ws-proxy] rejected proxy request: port=${port}, path=${path}`);
                socket.destroy();
                return;
            }
            activeSockets.add(socket);
            socket.setKeepAlive(true, 30000);
            socket.on('close', () => {
                activeSockets.delete(socket);
                console.log(`[ws-proxy] client closed ${port}${path}`);
            });
            socket.on('error', err => {
                activeSockets.delete(socket);
                console.error('[ws-proxy] client error:', err.message);
            });
            req.url = path;
            proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        } else {
            console.warn('[ws-proxy] rejected unauthorized proxy request');
            socket.destroy();
        }
    });
}

function closeAllSockets() {
    for (const socket of activeSockets) {
        if (!socket.destroyed) {
            socket.destroy();
        }
    }
    activeSockets.clear();
}

module.exports = { createWsProxy, mountWsUpgrade, isAllowedProxyTarget, extractAuthorizedProxyRequest, closeAllSockets };
