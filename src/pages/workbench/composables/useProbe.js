import { BRIDGE_METHODS } from '@/shared/constants.js';

/**
 * 探针注入和轮询 composable
 */
export function useProbe(cdpClient) {
    async function evaluate(expression) {
        return cdpClient.evaluate(expression);
    }

    async function injectProbe() {
        await evaluate(`(${probeInstaller.toString()})(${JSON.stringify(BRIDGE_METHODS)})`);
    }

    async function pollProbe() {
        const probe = await evaluate('window.__LOCAL_INSPECT_PROBE__ ? window.__LOCAL_INSPECT_PROBE__.dump() : null');
        return probe || null;
    }

    /**
     * 监听页面导航事件，主框架刷新后自动重新注入探针
     * @param {function} [onReinject] - 重注入成功后的回调
     */
    let reinjectRegistered = false;
    function setupAutoReinject(onReinject) {
        if (reinjectRegistered) return;
        reinjectRegistered = true;
        cdpClient.onEvent('Page.frameNavigated', async (params) => {
            // 只处理主框架导航，忽略 iframe
            if (params.frame?.parentId) return;
            // 导航后等待页面初步加载
            await new Promise(r => setTimeout(r, 500));
            try {
                await injectProbe();
                onReinject?.();
            } catch (e) {
                // 页面可能还在加载，忽略错误
            }
        });
    }

    return { injectProbe, pollProbe, setupAutoReinject };
}

function probeInstaller(bridgeMethods) {
    if (window.__LOCAL_INSPECT_PROBE__?.installed) return;
    const MAX = 240;
    const now = () => Date.now();
    const safeText = value => {
        try {
            if (value instanceof Error) return value.stack || value.message || String(value);
            if (typeof value === 'string') return value;
            return JSON.stringify(value);
        } catch (e) { return String(value); }
    };
    const redact = value => String(value || '').replace(/((?:access_)?token|password|client_secret|Authorization)(["'\s:=]+)([^"',\s&]+)/gi, '$1$2[REDACTED]').replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
    const state = {
        installed: true, breadcrumbs: [], errors: [], network: [],
        add(item) { this.breadcrumbs.push({ time: now(), ...item }); this.breadcrumbs = this.breadcrumbs.slice(-MAX); },
        addError(item) { this.errors.push({ time: now(), ...item }); this.errors = this.errors.slice(-MAX); this.add({ type: item.type || 'js', message: item.message, data: item }); },
        addNetwork(item) { this.network.push({ time: now(), ...item }); this.network = this.network.slice(-MAX); this.add({ type: 'network', message: `${item.method || 'GET'} ${item.status || item.error || ''} ${item.url || ''}`.trim(), data: item }); },
        dump() { return { installed: true, breadcrumbs: this.breadcrumbs.slice(-MAX), errors: this.errors.slice(-MAX), network: this.network.slice(-MAX) }; }
    };
    window.__LOCAL_INSPECT_PROBE__ = state;
    const originalConsole = { error: console.error, warn: console.warn };
    console.error = function (...args) { state.addError({ type: /Vue warn/i.test(args.join(' ')) ? 'vue' : 'js', source: 'probe-console', severity: 'error', message: redact(args.map(safeText).join(' ')) }); return originalConsole.error.apply(this, args); };
    console.warn = function (...args) { state.add({ type: 'console', message: redact(args.map(safeText).join(' ')), data: { level: 'warn' } }); return originalConsole.warn.apply(this, args); };
    const previousOnError = window.onerror;
    window.onerror = function (message, source, lineno, colno, error) { state.addError({ type: 'js', source: 'window.onerror', severity: 'error', message: redact(safeText(error || message)), url: source, lineNumber: lineno, columnNumber: colno, stack: error?.stack }); if (typeof previousOnError === 'function') return previousOnError.apply(this, arguments); return false; };
    const previousUnhandled = window.onunhandledrejection;
    window.onunhandledrejection = function (event) { state.addError({ type: 'js', source: 'unhandledrejection', severity: 'error', message: redact(safeText(event.reason)), stack: event.reason?.stack }); if (typeof previousUnhandled === 'function') return previousUnhandled.apply(this, arguments); };
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') { window.fetch = async function (input, init = {}) { const start = now(); const url = typeof input === 'string' ? input : input?.url; const method = (init.method || input?.method || 'GET').toUpperCase(); try { const response = await originalFetch.apply(this, arguments); if (!response.ok) state.addNetwork({ source: 'fetch', method, url: redact(url), status: response.status, statusText: response.statusText, duration: now() - start }); return response; } catch (error) { state.addNetwork({ source: 'fetch', method, url: redact(url), error: safeText(error), duration: now() - start }); throw error; } }; }
    const OriginalXHR = window.XMLHttpRequest;
    if (OriginalXHR) { window.XMLHttpRequest = function () { const xhr = new OriginalXHR(); let method = 'GET'; let url = ''; let start = 0; const originalOpen = xhr.open; const originalSend = xhr.send; xhr.open = function (m, u) { method = String(m || 'GET').toUpperCase(); url = String(u || ''); return originalOpen.apply(xhr, arguments); }; xhr.send = function () { start = now(); xhr.addEventListener('loadend', () => { if (xhr.status >= 400 || xhr.status === 0) state.addNetwork({ source: 'xhr', method, url: redact(url), status: xhr.status, statusText: xhr.statusText, duration: now() - start }); }); return originalSend.apply(xhr, arguments); }; return xhr; }; }
    const push = history.pushState; const replace = history.replaceState;
    history.pushState = function () { const ret = push.apply(this, arguments); state.add({ type: 'route', message: location.href, data: { mode: 'pushState' } }); return ret; };
    history.replaceState = function () { const ret = replace.apply(this, arguments); state.add({ type: 'route', message: location.href, data: { mode: 'replaceState' } }); return ret; };
    window.addEventListener('hashchange', () => state.add({ type: 'route', message: location.href, data: { mode: 'hashchange' } }), true);
    window.addEventListener('popstate', () => state.add({ type: 'route', message: location.href, data: { mode: 'popstate' } }), true);
    document.addEventListener('click', event => { const el = event.target?.closest?.('button,a,[role="button"],input,select,textarea,[class]'); if (!el) return; const label = (el.innerText || el.value || el.getAttribute('aria-label') || el.className || el.tagName || '').toString().trim().slice(0, 120); state.add({ type: 'click', message: label || el.tagName, data: { tag: el.tagName, id: el.id || '', className: String(el.className || '').slice(0, 120) } }); }, true);
    try { const Vue = window.Vue || document.querySelector('#app')?.__vue__?.constructor; if (Vue?.config && !Vue.config.__LOCAL_INSPECT_WRAPPED__) { const originalHandler = Vue.config.errorHandler; Vue.config.errorHandler = function (err, vm, info) { state.addError({ type: 'vue', source: 'Vue.config.errorHandler', severity: 'error', message: redact(safeText(err)), info, componentName: vm?.$options?.name || vm?.$options?._componentTag || '', route: location.href, stack: err?.stack }); if (typeof originalHandler === 'function') return originalHandler.apply(this, arguments); }; Vue.config.__LOCAL_INSPECT_WRAPPED__ = true; } } catch (e) {}
    state.add({ type: 'probe', message: 'Local Inspect probe installed', data: { bridgeMethods } });
}
