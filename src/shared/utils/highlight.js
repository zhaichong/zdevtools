import { escapeHtml } from './escape.js';

/**
 * 在文本中高亮搜索关键词，返回安全的 HTML 字符串
 * 大小写不敏感匹配，匹配与未匹配部分均经过 HTML 转义
 * @param {string} text - 原始文本
 * @param {string} query - 搜索关键词
 * @returns {string} 安全的 HTML 字符串，匹配部分用 <mark class="hl"> 包裹
 */
export function highlightText(text, query) {
    if (!text) return '';
    const rawText = String(text);
    if (!query) return escapeHtml(rawText);

    const rawQuery = String(query);
    if (!rawQuery) return escapeHtml(rawText);

    const textLower = rawText.toLowerCase();
    const queryLower = rawQuery.toLowerCase();
    const queryLen = rawQuery.length;

    let result = '';
    let cursor = 0;
    let idx = textLower.indexOf(queryLower, cursor);

    while (idx !== -1) {
        if (idx > cursor) {
            result += escapeHtml(rawText.slice(cursor, idx));
        }
        result += '<mark class="hl">';
        result += escapeHtml(rawText.slice(idx, idx + queryLen));
        result += '</mark>';
        cursor = idx + queryLen;
        idx = textLower.indexOf(queryLower, cursor);
    }

    if (cursor < rawText.length) {
        result += escapeHtml(rawText.slice(cursor));
    }
    return result;
}
