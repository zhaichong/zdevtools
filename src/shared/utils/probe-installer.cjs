const { buildRedactSource } = require('./redact-rules.cjs');

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
    const redact = value => String(value ?? '').replace(/((?:access_)?token|password|client_secret|Authorization)(["'\s:=]+)([^"',\s&]+)/gi, '$1$2[REDACTED]').replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
    const state = {
        installed: true, breadcrumbs: [], errors: [], network: [],
        add(item) { this.breadcrumbs.push({ time: now(), ...item }); this.breadcrumbs = this.breadcrumbs.slice(-MAX); },
        addError(item) { this.errors.push({ time: now(), ...item }); this.errors = this.errors.slice(-MAX); this.add({ type: item.type || 'js', message: item.message, data: item }); },
        addNetwork(item) { this.network.push({ time: now(), ...item }); this.network = this.network.slice(-MAX); this.add({ type: 'network', message: `${item.method || 'GET'} ${item.status || item.error || ''} ${item.url || ''}`.trim(), data: item }); },
        dump() { return { installed: true, breadcrumbs: this.breadcrumbs.slice(-MAX), errors: this.errors.slice(-MAX), network: this.network.slice(-MAX) }; }
    };
    window.__LOCAL_INSPECT_PROBE__ = state;
    const originalConsole = { error: console.error, warn: console.warn };
    const probeConsoleError = function (...args) { state.addError({ type: /Vue warn/i.test(args.join(' ')) ? 'vue' : 'js', source: 'probe-console', severity: 'error', message: redact(args.map(safeText).join(' ')) }); return originalConsole.error.apply(this, args); };
    const probeConsoleWarn = function (...args) { state.add({ type: 'console', message: redact(args.map(safeText).join(' ')), data: { level: 'warn' } }); return originalConsole.warn.apply(this, args); };
    console.error = probeConsoleError;
    console.warn = probeConsoleWarn;
    const previousOnError = window.onerror;
    const probeOnError = function (message, source, lineno, colno, error) { state.addError({ type: 'js', source: 'window.onerror', severity: 'error', message: redact(safeText(error || message)), url: source, lineNumber: lineno, columnNumber: colno, stack: redact(error?.stack || '') }); if (typeof previousOnError === 'function') return previousOnError.apply(this, arguments); return false; };
    window.onerror = probeOnError;
    const previousUnhandled = window.onunhandledrejection;
    const probeUnhandled = function (event) { state.addError({ type: 'js', source: 'unhandledrejection', severity: 'error', message: redact(safeText(event.reason)), stack: redact(event.reason?.stack || '') }); if (typeof previousUnhandled === 'function') return previousUnhandled.apply(this, arguments); };
    window.onunhandledrejection = probeUnhandled;
    const originalFetch = window.fetch;
    const probeFetch = async function (input, init = {}) { const start = now(); const url = typeof input === 'string' ? input : input?.url; const method = (init.method || input?.method || 'GET').toUpperCase(); try { const response = await originalFetch.apply(this, arguments); if (!response.ok) state.addNetwork({ source: 'fetch', method, url: redact(url), status: response.status, statusText: response.statusText, duration: now() - start }); return response; } catch (error) { state.addNetwork({ source: 'fetch', method, url: redact(url), error: safeText(error), duration: now() - start }); throw error; } };
    if (typeof originalFetch === 'function') window.fetch = probeFetch;
    const OriginalXHR = window.XMLHttpRequest;
    const ProbeXHR = function () { const xhr = new OriginalXHR(); let method = 'GET'; let url = ''; let start = 0; const originalOpen = xhr.open; const originalSend = xhr.send; xhr.open = function (m, u) { method = String(m || 'GET').toUpperCase(); url = String(u || ''); return originalOpen.apply(xhr, arguments); }; xhr.send = function () { start = now(); xhr.addEventListener('loadend', () => { if (xhr.status >= 400 || xhr.status === 0) state.addNetwork({ source: 'xhr', method, url: redact(url), status: xhr.status, statusText: xhr.statusText, duration: now() - start }); }); return originalSend.apply(xhr, arguments); }; return xhr; };
    if (OriginalXHR) window.XMLHttpRequest = ProbeXHR;
    const push = history.pushState; const replace = history.replaceState;
    const probePushState = function () { const ret = push.apply(this, arguments); state.add({ type: 'route', message: redact(location.href), data: { mode: 'pushState' } }); return ret; };
    const probeReplaceState = function () { const ret = replace.apply(this, arguments); state.add({ type: 'route', message: redact(location.href), data: { mode: 'replaceState' } }); return ret; };
    history.pushState = probePushState;
    history.replaceState = probeReplaceState;
    const onHashChange = () => state.add({ type: 'route', message: redact(location.href), data: { mode: 'hashchange' } });
    const onPopState = () => state.add({ type: 'route', message: redact(location.href), data: { mode: 'popstate' } });
    const onClick = event => { const el = event.target?.closest?.('button,a,[role="button"],input,select,textarea,[class]'); if (!el) return; const label = (el.innerText || el.value || el.getAttribute('aria-label') || el.className || el.tagName || '').toString().trim().slice(0, 120); state.add({ type: 'click', message: label || el.tagName, data: { tag: el.tagName, id: el.id || '', className: String(el.className || '').slice(0, 120) } }); };
    window.addEventListener('hashchange', onHashChange, true);
    window.addEventListener('popstate', onPopState, true);
    document.addEventListener('click', onClick, true);
    let vueConfig = null; let originalVueErrorHandler = null; let probeVueErrorHandler = null;
    try { const Vue = window.Vue || document.querySelector('#app')?.__vue__?.constructor; if (Vue?.config && !Vue.config.__LOCAL_INSPECT_WRAPPED__) { vueConfig = Vue.config; originalVueErrorHandler = vueConfig.errorHandler; probeVueErrorHandler = function (err, vm, info) { state.addError({ type: 'vue', source: 'Vue.config.errorHandler', severity: 'error', message: redact(safeText(err)), info, componentName: vm?.$options?.name || vm?.$options?._componentTag || '', route: redact(location.href), stack: redact(err?.stack || '') }); if (typeof originalVueErrorHandler === 'function') return originalVueErrorHandler.apply(this, arguments); }; vueConfig.errorHandler = probeVueErrorHandler; vueConfig.__LOCAL_INSPECT_WRAPPED__ = true; } } catch (e) {}
    state.dispose = () => {
        try { if (window.__rrweb_stop__) window.__rrweb_stop__(); } catch (e) {}
        delete window.__rrweb_stop__; delete window.__rrweb_started__;
        if (console.error === probeConsoleError) console.error = originalConsole.error;
        if (console.warn === probeConsoleWarn) console.warn = originalConsole.warn;
        if (window.onerror === probeOnError) window.onerror = previousOnError;
        if (window.onunhandledrejection === probeUnhandled) window.onunhandledrejection = previousUnhandled;
        if (window.fetch === probeFetch) window.fetch = originalFetch;
        if (window.XMLHttpRequest === ProbeXHR) window.XMLHttpRequest = OriginalXHR;
        if (history.pushState === probePushState) history.pushState = push;
        if (history.replaceState === probeReplaceState) history.replaceState = replace;
        window.removeEventListener('hashchange', onHashChange, true);
        window.removeEventListener('popstate', onPopState, true);
        document.removeEventListener('click', onClick, true);
        if (vueConfig?.errorHandler === probeVueErrorHandler) vueConfig.errorHandler = originalVueErrorHandler;
        if (vueConfig) delete vueConfig.__LOCAL_INSPECT_WRAPPED__;
        delete window.__LOCAL_INSPECT_PROBE__;
    };
    state.add({ type: 'probe', message: 'ztools probe installed', data: { bridgeMethods } });
}

function wrapProbeInstaller(bridgeMethods = []) {
    const installerStr = probeInstaller.toString().replace(/const redact = [^;]+;/, buildRedactSource());
    return `(${installerStr})(${JSON.stringify(bridgeMethods)})`;
}

module.exports = { probeInstaller, wrapProbeInstaller };
