import { ref } from 'vue';
import { normalizeCdpEvent } from '../utils/cdp-events.js';
import { RingBuffer } from '../utils/ring-buffer.js';

/**
 * 统一的 CDP WebSocket 客户端 composable
 * @param {number|string} port - 本地代理端口
 * @param {string} targetId - CDP target ID
 * @param {object} [options]
 * @param {boolean} [options.includeTime] - 事件是否包含时间戳（workbench 需要）
 * @param {number} [options.connectTimeout] - 连接超时 ms
 * @param {number} [options.sendTimeout] - 发送超时 ms
 * @returns {object}
 */
export function useCdpClient(port, targetId, options = {}) {
    const { includeTime = false, connectTimeout = 5000, sendTimeout = 7000 } = options;
    const connected = ref(false);
    const events = ref([]);

    // 环形缓冲区：O(1) push + 自动淘汰，避免 Array.splice 的 O(n) 开销
    const eventBuffer = new RingBuffer(2000);
    let pushCount = 0;

    let ws = null;
    let id = 1;
    const pending = new Map();
    const listeners = new Map(); // method -> Set<callback>

    function onEvent(method, callback) {
        if (!listeners.has(method)) listeners.set(method, new Set());
        listeners.get(method).add(callback);
        return () => listeners.get(method)?.delete(callback);
    }

    function offEvent(method, callback) {
        listeners.get(method)?.delete(callback);
    }

    function removeAllListeners() {
        listeners.clear();
    }

    function onMessage(event) {
        let payload;
        try {
            payload = JSON.parse(event.data);
        } catch (e) {
            return;
        }
        if (payload.id && pending.has(payload.id)) {
            const p = pending.get(payload.id);
            pending.delete(payload.id);
            payload.error ? p.reject(new Error(payload.error.message)) : p.resolve(payload.result);
            return;
        }
        if (payload.method) {
            // Dispatch raw event to subscribers
            const subs = listeners.get(payload.method);
            if (subs) subs.forEach(cb => cb(payload.params));
            // Also dispatch wildcard subscribers
            const wild = listeners.get('*');
            if (wild) wild.forEach(cb => cb(payload.method, payload.params));

            const normalized = normalizeCdpEvent(payload, { includeTime });
            if (normalized) {
                eventBuffer.push(normalized);
                pushCount++;
                // 每 50 次 push 批量同步一次到 Vue ref，避免每次事件都触发 O(n) 的数组操作
                if (pushCount % 50 === 0) {
                    events.value = eventBuffer.toArray();
                }
            }
        }
    }

    function connect() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 5;
            const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
            const wsUrl = `${protocol}://${location.host}/ws-proxy/${port}/devtools/page/${targetId}`;

            function tryConnect() {
                attempts++;
                ws = new WebSocket(wsUrl);

                const timeoutMs = connectTimeout * attempts; // 递增超时
                const timer = setTimeout(() => {
                    ws.close();
                    if (attempts < maxAttempts) {
                        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
                        console.log(`[cdp] connect timeout, retrying in ${delay}ms (attempt ${attempts}/${maxAttempts})`);
                        setTimeout(tryConnect, delay);
                    } else {
                        reject(new Error(`CDP connect failed after ${maxAttempts} attempts`));
                    }
                }, timeoutMs);

                ws.onopen = () => {
                    clearTimeout(timer);
                    connected.value = true;
                    console.log(`[cdp] connected on attempt ${attempts}`);
                    // 重连后自动重新启用 CDP domains
                    if (attempts > 1) {
                        enable().catch(e => console.warn('[cdp] re-enable after reconnect failed:', e));
                    }
                    resolve();
                };

                ws.onerror = () => {
                    clearTimeout(timer);
                    // 让 onclose 处理重试逻辑
                };

                ws.onmessage = event => onMessage(event);

                ws.onclose = (event) => {
                    connected.value = false;
                    clearTimeout(timer);
                    // 清理未完成的请求
                    for (const p of pending.values()) p.reject(new Error('CDP connection closed'));
                    pending.clear();

                    // 正常关闭(code 1000)或已达最大重试次数则不重连
                    if (event.code === 1000 || attempts >= maxAttempts) return;

                    const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
                    console.log(`[cdp] disconnected (code=${event.code}), reconnecting in ${delay}ms (attempt ${attempts}/${maxAttempts})`);
                    setTimeout(tryConnect, delay);
                };
            }

            tryConnect();
        });
    }

    function send(method, params = {}) {
        const msgId = id++;
        return new Promise((resolve, reject) => {
            pending.set(msgId, { resolve, reject });
            ws.send(JSON.stringify({ id: msgId, method, params }));
            setTimeout(() => {
                if (pending.has(msgId)) {
                    pending.delete(msgId);
                    reject(new Error(`${method} timeout`));
                }
            }, sendTimeout);
        });
    }

    async function enable() {
        await Promise.allSettled([
            send('Runtime.enable'),
            send('Log.enable'),
            send('Console.enable'),
            send('Page.enable'),
            send('Network.enable', { maxTotalBufferSize: 4000000, maxResourceBufferSize: 400000 })
        ]);
    }

    async function evaluate(expression) {
        const result = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            timeout: 5000
        });
        return result?.result?.value;
    }

    function close() {
        if (ws && ws.readyState <= 1) ws.close();
    }

    /** 强制同步环形缓冲区到 events ref（外部 poll 前调用以确保获取最新数据） */
    function syncEvents() {
        events.value = eventBuffer.toArray();
    }

    return { connected, events, connect, send, enable, evaluate, close, onEvent, offEvent, removeAllListeners, syncEvents };
}
