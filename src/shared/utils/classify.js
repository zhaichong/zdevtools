/**
 * 运行时错误分类
 * @param {string} text
 * @returns {string}
 */
export function classifyError(text) {
    const value = String(text || '');
    if (/Loading chunk|ChunkLoadError|dynamically imported module/i.test(value)) return '路由懒加载失败';
    if (/Vue warn|errorHandler|render function|nextTick/i.test(value)) return 'Vue 组件异常';
    if (/ReferenceError|TypeError|SyntaxError|RangeError|Script error/i.test(value)) return 'JS 运行时异常';
    if (/Mixed Content/i.test(value)) return '混合内容问题';
    if (/CORS|Access-Control-Allow-Origin/i.test(value)) return '跨域问题';
    if (/ERR_CERT|certificate/i.test(value)) return '证书问题';
    if (/404|net::ERR_ABORTED/i.test(value)) return '资源加载失败';
    if (/Network Error|timeout|接口|请求|axios|ApiBase/i.test(value)) return '接口失败';
    return '前端错误';
}

/**
 * Network 错误分类
 * @param {string} text
 * @returns {string}
 */
export function classifyNetworkError(text) {
    const value = String(text || '');
    if (/ERR_BLOCKED_BY_CLIENT|blocked/i.test(value)) return '请求被阻止';
    if (/ERR_CERT|certificate/i.test(value)) return '证书问题';
    if (/ERR_CONNECTION|ERR_ADDRESS|ERR_NAME|ERR_INTERNET/i.test(value)) return '网络连接失败';
    if (/ERR_ABORTED/i.test(value)) return '资源加载失败';
    return 'Network 失败';
}
