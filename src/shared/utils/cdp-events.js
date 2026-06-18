import { classifyError, classifyNetworkError } from './classify.js';
import { extractStack, extractCallFrames } from './stack.js';

/**
 * 将 CDP 事件归一化为标准化的诊断事件
 * @param {object} payload - CDP 原始事件
 * @param {object} [options]
 * @param {boolean} [options.includeTime] - 是否包含时间戳（workbench 需要）
 * @returns {object|null}
 */
export function normalizeCdpEvent(payload, { includeTime = false } = {}) {
    const { method, params = {} } = payload;
    const time = includeTime ? Date.now() : undefined;

    if (method === 'Runtime.exceptionThrown') {
        const details = params.exceptionDetails || {};
        const message = details.exception?.description || details.text || 'Runtime exception';
        return {
            ...(includeTime && { type: 'js', source: 'cdp', time }),
            ...(!includeTime && { type: 'runtime' }),
            severity: 'error',
            category: classifyError(message),
            ...(includeTime ? { message } : { text: details.text || details.exception?.description || 'Runtime exception' }),
            url: details.url,
            stack: extractStack(details),
            ...(!includeTime && { category: classifyError(details.text || details.exception?.description || '') })
        };
    }

    if (method === 'Log.entryAdded') {
        const entry = params.entry || {};
        if (!['error', 'warning'].includes(entry.level)) return null;
        const sev = entry.level === 'error' ? 'error' : 'warn';
        return {
            ...(includeTime && { type: entry.level === 'error' ? 'js' : 'console', source: 'cdp', time }),
            ...(!includeTime && { type: 'log' }),
            severity: sev,
            category: classifyError(entry.text || ''),
            ...(includeTime ? { message: entry.text || '' } : { text: entry.text || '' }),
            url: entry.url,
            stack: entry.stackTrace ? extractCallFrames(entry.stackTrace.callFrames) : []
        };
    }

    if (method === 'Console.messageAdded') {
        const message = params.message || {};
        if (!['error', 'warning'].includes(message.level)) return null;
        const sev = message.level === 'error' ? 'error' : 'warn';
        const msgText = message.text || '';
        return {
            ...(includeTime && {
                type: /Vue warn|errorHandler|nextTick|render function/i.test(msgText) ? 'vue' : 'console',
                source: 'cdp',
                time
            }),
            ...(!includeTime && { type: 'console' }),
            severity: sev,
            category: classifyError(msgText),
            ...(includeTime ? { message: msgText } : { text: msgText }),
            url: message.url,
            stack: []
        };
    }

    if (method === 'Network.loadingFailed') {
        return {
            type: 'network',
            ...(includeTime && { source: 'cdp', time, method: 'GET' }),
            severity: 'error',
            category: classifyNetworkError(params.errorText || ''),
            requestId: params.requestId,
            ...(includeTime ? { message: params.errorText || 'Network loading failed' } : { text: params.errorText || 'Network loading failed' })
        };
    }

    if (method === 'Network.responseReceived') {
        const response = params.response || {};
        if (response.status < 400) return null;
        const isResource = includeTime && /javascript|css|image|font|text\/html/i.test(response.mimeType || '');
        return {
            type: isResource ? 'resource' : 'network',
            ...(includeTime && { source: 'cdp', time, method: response.requestHeaders?.[':method'] || 'GET' }),
            severity: 'error',
            category: response.status === 404
                ? (includeTime ? '404' : '资源或接口 404')
                : (includeTime ? 'HTTP 错误' : '接口 HTTP 错误'),
            requestId: params.requestId,
            url: response.url,
            status: response.status,
            mimeType: response.mimeType,
            ...(includeTime
                ? { message: `${response.status} ${response.statusText || ''}`.trim() }
                : { text: `${response.status} ${response.statusText || ''}`.trim() })
        };
    }

    return null;
}

/**
 * Normalize a Network.requestWillBeSent event for the network monitor
 */
export function normalizeRequestWillBeSent(params) {
    const req = params.request || {};
    return {
        requestId: params.requestId,
        method: req.method || 'GET',
        url: req.url || '',
        type: params.type || 'Other',
        startTime: params.timestamp || Date.now(),
        initiator: params.initiator?.type || 'other',
        requestHeaders: req.headers || {}
    };
}

/**
 * Normalize a Network.responseReceived event for the network monitor
 */
export function normalizeResponseReceived(params) {
    const resp = params.response || {};
    return {
        requestId: params.requestId,
        status: resp.status,
        statusText: resp.statusText || '',
        mimeType: resp.mimeType || '',
        responseHeaders: resp.headers || {},
        remoteIPAddress: resp.remoteIPAddress || '',
        protocol: resp.protocol || '',
        encodedDataLength: resp.encodedDataLength || 0,
        responseTime: resp.responseTime || Date.now()
    };
}

/**
 * Normalize a Network.loadingFinished event for the network monitor
 */
export function normalizeLoadingFinished(params) {
    return {
        requestId: params.requestId,
        encodedDataLength: params.encodedDataLength || 0,
        endTime: params.timestamp || Date.now()
    };
}

/**
 * Normalize a Network.loadingFailed event for the network monitor
 */
export function normalizeLoadingFailed(params) {
    return {
        requestId: params.requestId,
        errorText: params.errorText || 'Failed',
        blockedReason: params.blockedReason || '',
        endTime: params.timestamp || Date.now()
    };
}

/**
 * Normalize Runtime.consoleAPICalled for the console stream
 */
export function normalizeConsoleApi(params) {
    const args = (params.args || []).map(arg => {
        if (arg.type === 'string' || arg.type === 'number' || arg.type === 'boolean') return String(arg.value ?? '');
        if (arg.type === 'undefined') return 'undefined';
        if (arg.type === 'object') return arg.description || arg.preview ? JSON.stringify(arg.preview, null, 0) : '[Object]';
        return arg.description || String(arg.value ?? arg.type);
    });
    return {
        level: params.type || 'log',
        text: args.join(' '),
        time: params.timestamp || Date.now(),
        stack: params.stackTrace?.callFrames || []
    };
}
