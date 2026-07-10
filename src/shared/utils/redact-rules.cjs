/**
 * 敏感信息脱敏规则 (CommonJS，方便主进程和注入脚本环境直接执行)
 * 作为安全脱敏的单一事实来源。
 */

// 扩展了包含 api_key, secret, private_key, session, cookie 等常见敏感词
const SENSITIVE_KEY_RE = /((?:access_)?token|password|client_secret|api_?key|secret|private_?key|session|cookie|Authorization)(["'\s:=]+)([^"',\s&]+)/gi;
const BEARER_RE = /(Bearer\s+)[A-Za-z0-9._-]+/gi;

/**
 * 敏感信息脱敏函数
 * 对字符串中的匹配项进行替换
 * 注意：必须先过滤 BEARER_RE，才能防止被 SENSITIVE_KEY_RE 的非贪婪消费导致真实 token 绕过
 */
function redact(value) {
    if (value == null) return '';
    return String(value)
        .replace(BEARER_RE, '$1[REDACTED]')
        .replace(SENSITIVE_KEY_RE, '$1$2[REDACTED]');
}

/**
 * 返回脱敏函数的字符串形式，供 CDP 注入到目标页面前端执行使用
 */
function buildRedactSource() {
    return `
        const SENSITIVE_KEY_RE = ${SENSITIVE_KEY_RE.toString()};
        const BEARER_RE = ${BEARER_RE.toString()};
        ${redact.toString()}
    `.trim();
}

module.exports = {
    SENSITIVE_KEY_RE,
    BEARER_RE,
    redact,
    buildRedactSource
};