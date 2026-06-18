/**
 * 从 URL 和行号生成源码位置提示
 * @param {string} url
 * @param {number} [lineNumber=0]
 * @param {number} [columnNumber=0]
 * @returns {string}
 */
export function sourceHint(url, lineNumber = 0, columnNumber = 0) {
    if (!url) return '';
    if (url.startsWith('webpack://')) return `${url}:${Number(lineNumber) + 1}:${Number(columnNumber) + 1}`;
    const chunk = url.split('/').pop();
    return `${chunk || url}:${Number(lineNumber) + 1}:${Number(columnNumber) + 1}`;
}

/**
 * 格式化时间为 HH:MM:SS
 * @param {number|string} value - 时间戳或可解析的值
 * @returns {string}
 */
export function formatTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleTimeString('zh-CN', { hour12: false });
}

/**
 * 当前时间字符串
 * @returns {string}
 */
export function nowTime() {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

/**
 * URL 缩短（只显示路径和 hash）
 * @param {string} url
 * @returns {string}
 */
export function shortUrl(url) {
    const parsed = safeUrl(url);
    return parsed ? `${parsed.pathname}${parsed.hash || ''}` : (url || '');
}

/**
 * 安全解析 URL
 * @param {string} url
 * @returns {URL|null}
 */
export function safeUrl(url) {
    try { return new URL(url); } catch (e) { return null; }
}

/**
 * 解析 error.html 的 err 参数
 * @param {string} url
 * @returns {string}
 */
export function decodeErrorPage(url) {
    try {
        const parsed = new URL(url);
        const err = parsed.searchParams.get('err');
        return err ? `进入 error.html：${decodeURIComponent(err).slice(0, 800)}` : '当前页面为 error.html。';
    } catch (e) {
        return '当前页面为 error.html。';
    }
}

/**
 * Promise 延时
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Split next-steps text into individual steps
 * @param {string} text
 * @returns {string[]}
 */
export function splitSteps(text) {
    const parts = String(text || '').split(/(?:\d+\.\s*)|[；;]/).map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : [String(text || '')];
}
