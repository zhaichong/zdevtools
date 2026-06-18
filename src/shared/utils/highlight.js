import { escapeHtml } from './escape.js';

/**
 * 在文本中高亮搜索关键词，返回安全的 HTML 字符串
 * 大小写不敏感匹配，未匹配部分经过 HTML 转义
 * @param {string} text - 原始文本
 * @param {string} query - 搜索关键词
 * @returns {string} 安全的 HTML 字符串，匹配部分用 <mark class="hl"> 包裹
 */
export function highlightText(text, query) {
    if (!query || !text) return escapeHtml(text);

    const escaped = escapeHtml(text);
    const escapedQuery = escapeHtml(query);
    if (!escapedQuery) return escaped;

    const escapedLower = escaped.toLowerCase();
    const queryLower = escapedQuery.toLowerCase();

    let result = '';
    let cursor = 0;
    let idx = escapedLower.indexOf(queryLower, cursor);

    while (idx !== -1) {
        // 匹配前的部分
        result += escaped.slice(cursor, idx);
        // 匹配部分 — 用 mark 包裹，保留原始大小写
        result += '<mark class="hl">';
        result += escaped.slice(idx, idx + escapedQuery.length);
        result += '</mark>';
        cursor = idx + escapedQuery.length;
        idx = escapedLower.indexOf(queryLower, cursor);
    }

    // 剩余部分
    result += escaped.slice(cursor);
    return result;
}
