/**
 * Shared CDP discovery helpers used by ADB/HDC device listing and page attach.
 * Kept CommonJS so the Electron main process and Node tests can require() it.
 */

const PAGE_TYPES = new Set(['page', 'webview', 'iframe', 'app', 'other']);
const PAGE_DEBUGGER_PATH_RE = /^\/devtools\/page\/[A-Za-z0-9_.:\-@%]+(?:\?[A-Za-z0-9_.:\-@%&=~+#]*)?$/i;
const BROWSER_DEBUGGER_RE = /\/devtools\/browser(?:\/|$|\?)/i;
const CDP_JSON_PATHS = ['/json/list', '/json'];

function decodeRepeated(value) {
    let decoded = value;
    try {
        for (let i = 0; i < 3; i++) {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
        }
    } catch {
        return '';
    }
    return decoded;
}

/**
 * Decode then accept only /devtools/page/<id>. Rejects %2e%2e/%2f traversal to /devtools/browser.
 */
function canonicalizePageDebuggerPath(path) {
    if (typeof path !== 'string' || !path) return '';
    const decoded = decodeRepeated(path.trim());
    if (!decoded) return '';
    const normalized = decoded.replace(/\\/g, '/');
    if (normalized.includes('..') || normalized.includes('\0')) return '';
    const pathname = normalized.split('?')[0];
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length !== 3 || parts[0].toLowerCase() !== 'devtools' || parts[1].toLowerCase() !== 'page') {
        return '';
    }
    return PAGE_DEBUGGER_PATH_RE.test(normalized) ? normalized : '';
}

function isPageDebuggerPath(path) {
    return canonicalizePageDebuggerPath(path) !== '';
}

function normalizeToPath(value) {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^wss?:\/\//i.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
        try {
            const parsed = new URL(trimmed);
            return parsed.pathname + parsed.search;
        } catch {
            return '';
        }
    }
    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return path.split('#')[0];
}

/**
 * Resolve a page-level CDP debugger path from a listed target.
 * Never returns /devtools/browser — chrome://inspect page attach uses /devtools/page/<id>.
 */
function resolvePageDebuggerPath({ wsDebuggerPath, webSocketDebuggerUrl, targetId } = {}) {
    for (const candidate of [wsDebuggerPath, webSocketDebuggerUrl]) {
        const path = canonicalizePageDebuggerPath(normalizeToPath(candidate));
        if (path) return path;
    }
    const id = String(targetId ?? '').trim();
    if (!id) return '';
    const fallback = id.startsWith('/devtools/page/') ? id : `/devtools/page/${id.replace(/^\//, '')}`;
    return canonicalizePageDebuggerPath(fallback);
}

function hasBrowserDebuggerUrl(wsUrl) {
    const path = normalizeToPath(wsUrl);
    return BROWSER_DEBUGGER_RE.test(wsUrl || '') || BROWSER_DEBUGGER_RE.test(path);
}

/**
 * Filter Chrome/HarmonyOS /json/list (or /json) entries down to attachable page/webview targets.
 */
function extractPageTargets(list, deviceId, localPort, processName) {
    return (list || []).reduce((targets, t) => {
        if (t == null || t.id == null || t.id === '') return targets;
        if (t.type === 'browser' || hasBrowserDebuggerUrl(t.webSocketDebuggerUrl)) return targets;

        const debuggerPath = resolvePageDebuggerPath({
            webSocketDebuggerUrl: t.webSocketDebuggerUrl,
            targetId: t.id
        });
        if (!debuggerPath) return targets;
        if (t.type && !PAGE_TYPES.has(t.type) && !isPageDebuggerPath(debuggerPath)) return targets;

        const id = String(t.id);
        targets.push({
            id,
            type: t.type || 'page',
            title: t.title || t.url || `WebView (${id.slice(0, 8)})`,
            url: t.url || '',
            description: t.description || '',
            faviconUrl: t.faviconUrl || '',
            devtoolsFrontendUrl: t.devtoolsFrontendUrl || '',
            webSocketDebuggerUrl: t.webSocketDebuggerUrl || '',
            wsDebuggerPath: debuggerPath,
            localPort,
            deviceId,
            processName
        });
        return targets;
    }, []);
}

/**
 * Probe /json/list then /json. Some WebViews only implement the legacy /json alias.
 */
async function fetchCdpTargetList(requestJson, localPort) {
    let last = { ok: false, data: [] };
    for (const suffix of CDP_JSON_PATHS) {
        const result = await requestJson(`http://127.0.0.1:${localPort}${suffix}`);
        if (result?.ok && Array.isArray(result.data)) {
            if (result.data.length > 0) return result;
            last = result;
        }
    }
    return last;
}

/**
 * Fetch /json/version metadata (browser, android-package, protocol-version)
 */
async function fetchCdpVersion(requestJson, localPort) {
    const result = await requestJson(`http://127.0.0.1:${localPort}/json/version`);
    if (result?.ok && typeof result.data === 'object' && result.data !== null && !Array.isArray(result.data)) {
        return result.data;
    }
    return null;
}

module.exports = {
    PAGE_DEBUGGER_PATH_RE,
    CDP_JSON_PATHS,
    isPageDebuggerPath,
    canonicalizePageDebuggerPath,
    resolvePageDebuggerPath,
    extractPageTargets,
    fetchCdpTargetList,
    fetchCdpVersion
};

