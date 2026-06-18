/**
 * 敏感信息脱敏正则（共享）
 */
const SENSITIVE_KEY_RE = /((?:access_)?token|password|client_secret|Authorization)(["'\s:=]+)([^"',\s&]+)/gi;
const BEARER_RE = /(Bearer\s+)[A-Za-z0-9._-]+/gi;

/**
 * 对字符串中的敏感信息进行脱敏
 * @param {*} value
 * @returns {string}
 */
export function redact(value) {
    return String(value ?? '')
        .replace(SENSITIVE_KEY_RE, '$1$2[REDACTED]')
        .replace(BEARER_RE, '$1[REDACTED]');
}

/**
 * 服务端使用的脱敏函数（别名）
 */
export const redactSensitive = redact;
