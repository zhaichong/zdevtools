import { sourceHint } from './format.js';

/**
 * 从 CDP exceptionDetails 提取调用栈
 * @param {object} details
 * @returns {Array}
 */
export function extractStack(details) {
    if (details.stackTrace?.callFrames) return extractCallFrames(details.stackTrace.callFrames);
    if (details.exception?.description) return parseStackText(details.exception.description);
    return [];
}

/**
 * 从 CDP callFrames 数组提取标准化的栈帧
 * @param {Array} frames
 * @returns {Array}
 */
export function extractCallFrames(frames) {
    return (frames || []).slice(0, 12).map(frame => ({
        functionName: frame.functionName || '(anonymous)',
        url: frame.url,
        lineNumber: Number.isFinite(frame.lineNumber) ? frame.lineNumber + 1 : undefined,
        columnNumber: Number.isFinite(frame.columnNumber) ? frame.columnNumber + 1 : undefined,
        source: sourceHint(frame.url, frame.lineNumber, frame.columnNumber)
    }));
}

/**
 * 从错误文本中解析调用栈
 * @param {string} text
 * @returns {Array}
 */
export function parseStackText(text) {
    return String(text || '').split('\n').slice(1, 12).map(line => {
        const match = line.match(/\(?((?:webpack|https?|file|http):\/\/[^:)]+|[^()\s]+\.js):(\d+):(\d+)\)?/);
        return {
            functionName: line.trim().replace(/\(.*/, '').replace(/^at\s+/, '') || '(anonymous)',
            url: match?.[1] || '',
            lineNumber: match ? Number(match[2]) : undefined,
            columnNumber: match ? Number(match[3]) : undefined,
            source: match ? sourceHint(match[1], Number(match[2]) - 1, Number(match[3]) - 1) : ''
        };
    });
}

/**
 * 标准化调用栈（兼容数组、字符串和 message 回退）
 * @param {*} stack
 * @param {string} message
 * @returns {Array}
 */
export function normalizeStack(stack, message) {
    if (Array.isArray(stack)) return stack.map(frame => ({
        ...frame,
        source: frame.source || sourceHint(frame.url, frame.lineNumber, frame.columnNumber)
    }));
    if (typeof stack === 'string') return parseStackText(stack);
    if (typeof message === 'string') return parseStackText(message);
    return [];
}
