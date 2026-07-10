/**
 * 将任意值转为安全文件名（只保留字母数字._-，最长 120 字符）
 * @param {any} value
 * @returns {string}
 */
function safeFilePart(value) {
    return String(value || 'unknown').replace(/[^a-z0-9_.-]/gi, '_').slice(0, 120);
}

/**
 * 安全解析 JSONL 文本，跳过损坏行
 * @param {string} text
 * @returns {object[]}
 */
function safeJsonLines(text) {
    return text.split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
}

module.exports = { safeFilePart, safeJsonLines };
