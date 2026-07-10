import { ref, shallowRef } from 'vue';
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
    // shallowRef: 事件数组只整体替换，不做深响应式代理（2000 个对象的 Proxy 开销大）
    const events = shallowRef([]);

    // 环形缓冲区：O(1) push + 自动淘汰，避免 Array.splice 的 O(n) 开销
    const eventBuffer = new RingBuffer(2000);

    // 暂停/恢复机制：最小化时暂停处理，恢复时分批消化积压
    let _paused = false;
    let _pausedQueue = [];
    const MAX_PAUSED_QUEUE = 500;

    let ws = null;
    let id = 1;
    let closed = false;           // 标记已关闭，阻止重连
    let reconnectTimer = null;    // 跟踪重连定时器，close() 时取消
    let wasConnected = false;     // 标记是否曾成功连接过（用于重连检测）
    const pending = new Map();    // msgId -> { resolve, reject, timeoutId }
    const listeners = new Map(); // method -> Set<callback>
    const enabledDomains = new Set(); // 跟踪已启用的 CDP Domain

    // 面板→CDP Domain 映射表（供外部按需调用）
    const PANEL_DOMAINS = {
        diagnosis: ['Runtime', 'Page'],
        network: ['Network'],
        console: ['Console'],
        timeline: ['Runtime', 'Page'],
        logs: [],
        report: [],
        devtools: []
    };
    // 始终需要的基础域
    const BASE_DOMAINS = ['Runtime', 'Page'];

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

    // ========== 暂停/恢复机制 ==========

    /**
     * 暂停 CDP 事件处理。最小化时调用，避免积压导致恢复时卡死。
     * 暂停期间到达的 WebSocket 消息入队但不处理，队列上限 MAX_PAUSED_QUEUE。
     */
    function pause() {
        if (_paused) return;
        _paused = true;
        // 取消待触发的 sync，避免恢复时叠加
        if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    }

    /**
     * 恢复 CDP 事件处理。积压的消息通过 requestAnimationFrame 分批消化，
     * 每帧最多 50 条，避免恢复时一次爆发阻塞主线程。
     */
    function resume() {
        if (!_paused) return;
        _paused = false;
        const queue = _pausedQueue;
        _pausedQueue = [];
        if (queue.length > 0) {
            processQueuedMessages(queue, 0);
        }
    }

    function processQueuedMessages(queue, index) {
        const batchSize = 50;
        const end = Math.min(index + batchSize, queue.length);
        for (let i = index; i < end; i++) {
            try {
                const payload = JSON.parse(queue[i]);
                handleMessage(payload);
            } catch (e) { /* 单条失败不影响后续 */ }
        }
        if (end < queue.length) {
            requestAnimationFrame(() => processQueuedMessages(queue, end));
        } else {
            scheduleSync(); // 所有批次消化完后再同步到 events ref
        }
    }

    // ========== 消息处理 ==========

    let syncTimer = null;
    function scheduleSync() {
        if (!syncTimer) {
            syncTimer = setTimeout(() => {
                syncTimer = null;
                events.value = eventBuffer.toArray();
            }, 100);
        }
    }

    /** 处理单条 CDP 消息（提取到独立函数供 onMessage 和 recover 共用） */
    function handleMessage(payload) {
        if (payload.id && pending.has(payload.id)) {
            const p = pending.get(payload.id);
            pending.delete(payload.id);
            clearTimeout(p.timeoutId); // 响应到达，清除超时定时器
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
                scheduleSync();
            }
        }
    }

    function onMessage(event) {
        // 暂停态：入队限长后返回，不处理、不触发响应式
        if (_paused) {
            if (_pausedQueue.length < MAX_PAUSED_QUEUE) {
                _pausedQueue.push(event.data);
            }
            return;
        }
        let payload;
        try {
            payload = JSON.parse(event.data);
        } catch (e) {
            return;
        }
        handleMessage(payload);
    }

    function connect() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 5;
            const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
            const wsUrl = `${protocol}://${location.host}/ws-proxy/${port}/devtools/page/${targetId}`;
            closed = false; // 重置关闭标记，允许新连接

            function tryConnect() {
                if (closed) return; // 已关闭则不再创建新连接
                attempts++;
                ws = new WebSocket(wsUrl);

                const timeoutMs = connectTimeout * attempts; // 递增超时
                const timer = setTimeout(() => {
                    ws.close();
                    if (closed) return;
                    if (attempts < maxAttempts) {
                        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
                        console.log(`[cdp] connect timeout, retrying in ${delay}ms (attempt ${attempts}/${maxAttempts})`);
                        reconnectTimer = setTimeout(tryConnect, delay);
                    } else {
                        reject(new Error(`CDP connect failed after ${maxAttempts} attempts`));
                    }
                }, timeoutMs);

                ws.onopen = () => {
                    clearTimeout(timer);
                    if (closed) { ws.close(); return; } // 如果在等待期间被 close()
                    connected.value = true;
                    console.log(`[cdp] connected on attempt ${attempts}`);
                    // 重连后自动重新启用 CDP domains
                    if (wasConnected) {
                        enable().catch(e => console.warn('[cdp] re-enable after reconnect failed:', e));
                    }
                    wasConnected = true;
                    attempts = 0; // 重置重试次数，保障无限自愈
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
                    // 清理未完成的请求及其超时定时器
                    for (const p of pending.values()) {
                        clearTimeout(p.timeoutId);
                        p.reject(new Error('CDP connection closed'));
                    }
                    pending.clear();
                    // 清空已启用 domain 记录，确保重连后能重新发送 enable 命令
                    enabledDomains.clear();

                    // 已关闭、正常关闭(code 1000)、或已达最大重试次数则不重连
                    if (closed || event.code === 1000 || attempts >= maxAttempts) return;

                    const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
                    console.log(`[cdp] disconnected (code=${event.code}), reconnecting in ${delay}ms (attempt ${attempts}/${maxAttempts})`);
                    reconnectTimer = setTimeout(tryConnect, delay);
                };
            }

            tryConnect();
        });
    }

    function send(method, params = {}) {
        const msgId = id++;
        return new Promise((resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('CDP connection is not open'));
                return;
            }
            const timeoutId = setTimeout(() => {
                if (pending.has(msgId)) {
                    pending.delete(msgId);
                    reject(new Error(`${method} timeout`));
                }
            }, sendTimeout);
            pending.set(msgId, { resolve, reject, timeoutId });
            try {
                ws.send(JSON.stringify({ id: msgId, method, params }));
            } catch (error) {
                clearTimeout(timeoutId);
                pending.delete(msgId);
                reject(error);
                return;
            }
        });
    }

    // ========== CDP Domain 生命周期管理 ==========

    /**
     * 启用单个 CDP Domain
     * @param {string} domain - 域名称（如 'Network'）
     * @param {object} [params] - 可选的 enable 参数
     */
    async function enableDomain(domain, params) {
        if (enabledDomains.has(domain)) return;
        await send(`${domain}.enable`, params);
        enabledDomains.add(domain);
    }

    /**
     * 禁用单个 CDP Domain
     * @param {string} domain - 域名称（如 'Network'）
     */
    async function disableDomain(domain) {
        if (!enabledDomains.has(domain)) return;
        await send(`${domain}.disable`).catch(() => {});
        enabledDomains.delete(domain);
    }

    /**
     * 禁用除基础域外的所有 CDP Domain（最小化时调用，减轻目标 WebView 负载）
     */
    async function disableAllDomains() {
        for (const domain of [...enabledDomains]) {
            if (BASE_DOMAINS.includes(domain)) continue;
            await disableDomain(domain);
        }
    }

    /**
     * 按面板启用所需 CDP Domain
     * @param {string} panelName - 面板名（diagnosis/network/console/timeline/logs/report/devtools）
     */
    async function enableDomainsForPanel(panelName) {
        const needed = new Set([...BASE_DOMAINS, ...(PANEL_DOMAINS[panelName] || [])]);
        const toDisable = [...enabledDomains].filter(d => !needed.has(d) && !BASE_DOMAINS.includes(d));
        const toEnable = [...needed].filter(d => !enabledDomains.has(d));
        await Promise.allSettled([
            ...toDisable.map(d => disableDomain(d)),
            ...toEnable.map(d => enableDomain(d, d === 'Network' ? { maxTotalBufferSize: 4000000, maxResourceBufferSize: 400000 } : undefined))
        ]);
    }

    async function enable() {
        await Promise.allSettled([
            enableDomain('Runtime'),
            enableDomain('Log'),
            enableDomain('Console'),
            enableDomain('Page'),
            enableDomain('Network', { maxTotalBufferSize: 4000000, maxResourceBufferSize: 400000 })
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
        closed = true;
        // 取消待触发的重连定时器
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        // 取消 debounce sync 定时器
        if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
        // 清除所有 pending 请求的超时定时器
        for (const p of pending.values()) clearTimeout(p.timeoutId);
        pending.clear();
        // 禁用除基础域外的所有 CDP Domain（通知目标停止推送事件）
        if (ws && ws.readyState === 1) { // 仅 OPEN 状态可 send
            for (const domain of [...enabledDomains]) {
                if (BASE_DOMAINS.includes(domain)) continue;
                ws.send(JSON.stringify({ id: id++, method: `${domain}.disable`, params: {} }));
            }
        }
        enabledDomains.clear();
        // 关闭 WebSocket（readyState 0/1 均可调 close 安全关闭/中止连接）
        if (ws && ws.readyState <= 1) ws.close();
    }

    /** 强制同步环形缓冲区到 events ref（外部 poll 前调用以确保获取最新数据） */
    function syncEvents() {
        events.value = eventBuffer.toArray();
    }

    return { connected, events, connect, send, enable, evaluate, close, onEvent, offEvent, removeAllListeners, syncEvents, pause, resume, enableDomain, disableDomain, disableAllDomains, enableDomainsForPanel, PANEL_DOMAINS };
}
