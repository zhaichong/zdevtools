/**
 * HTML 转义，防止 XSS
 * @param {*} value
 * @returns {string}
 */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

/**
 * HTML 属性转义（额外处理反引号）
 * @param {*} value
 * @returns {string}
 */
export function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
}
