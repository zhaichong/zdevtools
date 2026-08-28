/**
 * baseDriver.js — adb/hdc 共享的基础工具函数和日志流管理器
 */

const { redact } = require('../../shared/utils/redact-rules.cjs');

/**
 * 每次对输出到日志面板的日志进行过滤
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
function normalizeAbstractSocket(name) {
    return String(name || '').replace(/^@+/, '');
}

function parseDevtoolsSockets(output) {
    const socketMatches = [...String(output || '').matchAll(/@([A-Za-z0-9_.-]*devtools_remote[A-Za-z0-9_.-]*)/g)];
    return [...new Set(socketMatches.map(match => normalizeAbstractSocket(match[1])))];
}

function sanitizeLogChunk(text) {
    return redact(text);
}

const BENIGN_STDERR_RE = /daemon not running|daemon started successfully|waiting for device|beginning of/i;

function sendToSubscribers(streamData, channel, payload) {
    for (const sub of streamData.subscribers) {
        if (!sub.isDestroyed()) sub.send(channel, payload);
    }
}

/**
 * 创建日志流管理器（start/stop + 订阅者模式）
 *
 * @param {object} config
 * @param {Function} config.getToolPath - 返回可执行文件路径
 * @param {Function} config.buildArgs - (id) => 命令参数数组
 * @param {string} config.errorLabel - 进程错误标签（如 'Logcat' 或 'Hilog'）
 * @param {Function} [config.spawnImpl] - 可注入的 spawn，便于测试
 * @returns {{ startLogStream, stopLogStream }}
 */
function createLogStreamManager({ getToolPath, buildArgs, errorLabel, spawnImpl }) {
    const activeStreams = new Map();
    const spawn = spawnImpl || require('child_process').spawn;

    function attachChild(id, streamData, child) {
        streamData.child = child;
        streamData.sawOutput = false;
        streamData.stderrText = '';
        streamData.finished = false;
        let chunkBuffer = '';
        let debounceTimer = null;

        function finish(reason) {
            if (streamData.finished) return;
            streamData.finished = true;
            if (reason && !streamData.stoppedByUs) {
                sendToSubscribers(streamData, 'logcat-error', reason);
            }
            activeStreams.delete(id);
        }

        child.stdout?.on('data', (chunk) => {
            streamData.sawOutput = true;
            chunkBuffer += chunk.toString();
            if (!debounceTimer) {
                debounceTimer = setTimeout(() => {
                    let text = chunkBuffer;
                    chunkBuffer = '';
                    debounceTimer = null;
                    if (text) {
                        sendToSubscribers(streamData, 'logcat-chunk', sanitizeLogChunk(text));
                    }
                }, 50);
            }
        });

        child.stderr?.on('data', (chunk) => {
            streamData.stderrText += chunk.toString();
        });

        child.on('error', (err) => {
            finish(`${errorLabel} process error: ${err.message}`);
            streamData.stoppedByUs = true;
            try { child.kill(); } catch (e) { /* ignore */ }
        });

        child.on('close', (code) => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
                if (chunkBuffer) {
                    sendToSubscribers(streamData, 'logcat-chunk', sanitizeLogChunk(chunkBuffer));
                    chunkBuffer = '';
                }
            }
            if (streamData.stoppedByUs) {
                finish(null);
                return;
            }
            const stderr = streamData.stderrText.trim().replace(/\s+/g, ' ').slice(0, 300);
            const usefulStderr = stderr && !BENIGN_STDERR_RE.test(stderr) ? stderr : '';
            if (!streamData.sawOutput) {
                const detail = usefulStderr || stderr || ((code !== 0 && code !== null)
                    ? `exited with code ${code} and produced no output`
                    : 'ended without log output. Check device connection and permission.');
                finish(`${errorLabel}: ${detail}`);
                return;
            }
            if (code !== 0 && code !== null && usefulStderr) {
                finish(`${errorLabel} exited with code ${code}: ${usefulStderr}`);
            } else {
                finish(null);
            }
        });
    }

    return {
        startLogStream: async (id, webContents) => {
            if (!id) return { status: 'error', message: 'deviceId is required' };
            if (!webContents) return { status: 'error', message: 'webContents is required' };

            let streamData = activeStreams.get(id);
            if (!streamData) {
                streamData = { child: null, subscribers: new Set(), bound: new WeakSet(), stoppedByUs: false };
                activeStreams.set(id, streamData);
            }

            streamData.subscribers.add(webContents);

            if (!streamData.bound.has(webContents)) {
                streamData.bound.add(webContents);
                webContents.once('destroyed', () => {
                    const current = activeStreams.get(id);
                    if (!current) return;
                    current.subscribers.delete(webContents);
                    if (current.subscribers.size === 0) {
                        current.stoppedByUs = true;
                        try { current.child?.kill(); } catch (e) { /* ignore */ }
                        activeStreams.delete(id);
                    }
                });
            }

            if (!streamData.child) {
                let child;
                try {
                    child = spawn(getToolPath(), buildArgs(id), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
                } catch (err) {
                    activeStreams.delete(id);
                    return { status: 'error', message: `${errorLabel} spawn failed: ${err.message}` };
                }
                attachChild(id, streamData, child);
            }

            return { status: 'success' };
        },

        stopLogStream: (id, webContents) => {
            const streamData = activeStreams.get(id);
            if (streamData && webContents) {
                streamData.subscribers.delete(webContents);
                if (streamData.subscribers.size === 0) {
                    streamData.stoppedByUs = true;
                    try { streamData.child?.kill(); } catch (e) { /* ignore */ }
                    activeStreams.delete(id);
                }
            }
        },

        /**
         * 杀死所有活跃的日志子进程（teardown 时调用，防止孤儿进程）
         */
        killAll() {
            for (const [, streamData] of activeStreams) {
                streamData.stoppedByUs = true;
                try { streamData.child?.kill(); } catch (e) { /* ignore */ }
            }
            activeStreams.clear();
        }
    };
}

module.exports = { withRetry, parseDevtoolsSockets, normalizeAbstractSocket, sanitizeLogChunk, createLogStreamManager };
