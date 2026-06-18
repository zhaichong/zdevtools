import { ref } from 'vue';
import { normalizeCdpEvent } from '../utils/cdp-events.js';

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
                events.value.push(normalized);
                // Cap events array to prevent unbounded memory growth
                if (events.value.length > 2000) events.value.splice(0, events.value.length - 2000);
            }
        }
    }

    function connect() {
        return new Promise((resolve, reject) => {
            const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
            ws = new WebSocket(`${protocol}://${location.host}/ws-proxy/${port}/devtools/page/${targetId}`);
            const timer = setTimeout(() => reject(new Error('CDP connect timeout')), connectTimeout);
            ws.onopen = () => {
                clearTimeout(timer);
                connected.value = true;
                resolve();
            };
            ws.onerror = () => {
                clearTimeout(timer);
                reject(new Error('CDP websocket error'));
            };
            ws.onmessage = event => onMessage(event);
            ws.onclose = () => {
                connected.value = false;
                for (const p of pending.values()) p.reject(new Error('CDP connection closed'));
                pending.clear();
            };
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

    return { connected, events, connect, send, enable, evaluate, close, onEvent, offEvent, removeAllListeners };
}
