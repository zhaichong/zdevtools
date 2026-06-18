/**
 * Express 中间件：请求超时 + 全局错误处理
 */

/**
 * 请求超时中间件
 * @param {number} [ms=15000] - 超时毫秒
 */
function requestTimeout(ms = 15000) {
    return (req, res, next) => {
        const timer = setTimeout(() => {
            if (!res.headersSent) {
                res.status(504).json({ error: 'Request timeout' });
            }
        }, ms);
        res.on('finish', () => clearTimeout(timer));
        res.on('close', () => clearTimeout(timer));
        next();
    };
}

/**
 * 异步路由包装器：自动捕获 async 错误
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, _next) {
    console.error('[server] unhandled error:', err?.message || err);
    if (res.headersSent) return;
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
}

module.exports = { requestTimeout, asyncHandler, errorHandler };
