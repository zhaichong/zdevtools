/**
 * Express 中间件：全局错误处理
 */

/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, _next) {
    console.error('[server] unhandled error:', err?.message || err);
    if (res.headersSent) return;
    res.status(err.status || 500).json({
        error: process.env.VITE_DEV === 'true' ? (err.message || 'Internal Server Error') : 'Internal Server Error'
    });
}

module.exports = { errorHandler };
