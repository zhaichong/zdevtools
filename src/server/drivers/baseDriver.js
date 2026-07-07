/**
 * baseDriver.js — adb/hdc 共享的基础工具函数和日志流管理器
 */

/**
 * 带指数退避的重试包装器
 * @param {Function} fn - 返回 { ok: boolean, ... } 的异步函数
 * @param {object} options - { maxRetries, baseDelay }
 */
function withRetry(fn, { maxRetries = 3, baseDelay = 1000 } = {}) {
    return async (...args) => {
        let lastResult;
        for (let i = 0; i <= maxRetries; i++) {
            lastResult = await fn(...args);
            if (lastResult.ok) return lastResult;
            if (i < maxRetries) {
                const delay = baseDelay * Math.pow(2, i);
                await new Promise(r => setTimeout(r, delay));
            }
        }
        return lastResult;
    };
}

/**
 * 从 /proc/net/unix 输出中解析 devtools_remote socket 名称
 */
function parseDevtoolsSockets(output) {
    const socketMatches = [...output.matchAll(/@([A-Za-z0-9_.-]*devtools_remote[A-Za-z0-9_.-]*)/g)];
    return [...new Set(socketMatches.map(match => match[1]))];
}

/**
 * 创建日志流管理器（start/stop + 订阅者模式）
 *
 * @param {object} config
 * @param {Function} config.getToolPath - 返回可执行文件路径
 * @param {Function} config.buildArgs - (id) => 命令参数数组
 * @param {string} config.errorLabel - 进程错误标签（如 'Logcat' 或 'Hilog'）
 * @returns {{ startLogStream, stopLogStream }}
 */
function createLogStreamManager({ getToolPath, buildArgs, errorLabel }) {
    const activeStreams = new Map();

    return {
        startLogStream: async (id, webContents) => {
            if (!id) return { status: 'error', message: 'deviceId is required' };

            let streamData = activeStreams.get(id);

            if (!streamData) {
                const { spawn } = require('child_process');
                const args = buildArgs(id);
                const newChild = spawn(getToolPath(), args, { windowsHide: true });

                streamData = { child: newChild, subscribers: new Set() };
                activeStreams.set(id, streamData);

                let chunkBuffer = '';
                let debounceTimer = null;

                newChild.stdout.on('data', (chunk) => {
                    chunkBuffer += chunk.toString();
                    if (!debounceTimer) {
                        debounceTimer = setTimeout(() => {
                            const text = chunkBuffer;
                            chunkBuffer = '';
                            debounceTimer = null;
                            if (text) {
                                for (const sub of streamData.subscribers) {
                                    if (!sub.isDestroyed()) sub.send('logcat-chunk', text);
                                }
                            }
                        }, 50);
                    }
                });

                newChild.stderr.on('data', (chunk) => {
                    const message = chunk.toString().trim();
                    if (message) {
                        for (const sub of streamData.subscribers) {
                            if (!sub.isDestroyed()) sub.send('logcat-error', message);
                        }
                    }
                });

                newChild.on('error', (err) => {
                    for (const sub of streamData.subscribers) {
                        if (!sub.isDestroyed()) sub.send('logcat-error', `${errorLabel} process error: ${err.message}`);
                    }
                    activeStreams.delete(id);
                });

                newChild.on('close', (code) => {
                    if (code !== 0 && code !== null) {
                        for (const sub of streamData.subscribers) {
                            if (!sub.isDestroyed()) sub.send('logcat-error', `${errorLabel} process exited with code ${code}`);
                        }
                    }
                    activeStreams.delete(id);
                });
            }

            // 加入订阅者
            streamData.subscribers.add(webContents);

            // 监听销毁事件，自动解除订阅
            const cleanup = () => {
                if (streamData) {
                    streamData.subscribers.delete(webContents);
                    if (streamData.subscribers.size === 0) {
                        streamData.child.kill();
                        activeStreams.delete(id);
                        streamData = null;
                    }
                }
            };
            webContents.once('destroyed', cleanup);
            webContents.once('did-navigate', cleanup);

            return { status: 'success' };
        },

        stopLogStream: (id, webContents) => {
            const streamData = activeStreams.get(id);
            if (streamData && webContents) {
                streamData.subscribers.delete(webContents);
                if (streamData.subscribers.size === 0) {
                    streamData.child.kill();
                    activeStreams.delete(id);
                }
            }
        },

        /**
         * 杀死所有活跃的日志子进程（teardown 时调用，防止孤儿进程）
         */
        killAll() {
            for (const [id, streamData] of activeStreams) {
                try { streamData.child.kill(); } catch (e) { /* ignore */ }
            }
            activeStreams.clear();
        }
    };
}

module.exports = { withRetry, parseDevtoolsSockets, createLogStreamManager };
