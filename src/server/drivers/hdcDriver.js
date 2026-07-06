const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const HDC_TIMEOUT_MS = 6000;

function getHdcPath() {
    const candidates = [
        path.join(__dirname, '..', '..', '..', 'bin', 'hdc.exe'),
        process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'hdc.exe') : null
    ].filter(Boolean);

    const hdcPath = candidates.find(candidate => fs.existsSync(candidate));
    return hdcPath || 'hdc';
}

function runHdc(args, timeout = HDC_TIMEOUT_MS) {
    return new Promise((resolve) => {
        execFile(getHdcPath(), args, { timeout, windowsHide: true }, (error, stdout, stderr) => {
            resolve({
                ok: !error,
                stdout: stdout || '',
                stderr: stderr || '',
                error: error ? error.message : ''
            });
        });
    });
}

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

const runHdcWithRetry = withRetry(runHdc, { maxRetries: 3, baseDelay: 1000 });

function parseDevices(output) {
    // hdc list targets
    // f4012241524a3131581562b11e9ebc00
    // Sometimes it outputs empty or [Empty]
    return output.split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.includes('[Empty]') && !line.includes('OpenHarmony device connector'))
        .map(line => {
            const parts = line.split(/\s+/);
            return { id: parts[0], status: 'device' }; // HDC generally just lists connected targets
        });
}

function parseForwards(output) {
    // hdc fport ls
    // f4012241524a3131581562b11e9ebc00 tcp:9222 localabstract:webview_devtools_remote_1234
    // Note: the output format might slightly differ from adb, assuming similar structure
    return output.split(/\r?\n/).reduce((items, line) => {
        const matchNoId = line.match(/tcp:(\d+)\s+localabstract:(\S+)/);
        if (matchNoId) {
            // Some hdc outputs have ID at start, some don't.
            const possibleIdMatch = line.match(/^([A-Za-z0-9_-]+)\s+tcp:/);
            const id = possibleIdMatch ? possibleIdMatch[1] : '*';
            items.push({ id, localPort: Number.parseInt(matchNoId[1], 10), socket: matchNoId[2] });
        }
        return items;
    }, []);
}

function parseDevtoolsSockets(output) {
    const socketMatches = [...output.matchAll(/@([A-Za-z0-9_.-]*devtools_remote[A-Za-z0-9_.-]*)/g)];
    return [...new Set(socketMatches.map(match => match[1]))];
}

function redactSensitive(text) {
    return String(text || '')
        .replace(/(access_token|token|password|client_secret|Authorization)(["'\s:=]+)([^"',\s&]+)/gi, '$1$2[REDACTED]')
        .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}

const activeLogStreams = new Map();

module.exports = {
    type: 'hdc',
    name: 'HarmonyOS HDC',

    checkAvailability: async () => {
        const result = await runHdcWithRetry(['-v']); // HDC version check is safer than list forwards
        if (!result.ok && /cannot|failed|not found|ENOENT|not recognized/i.test(result.error + result.stderr)) {
            return { available: false, error: result.error || result.stderr || 'unknown error' };
        }
        return { available: true };
    },

    listDevices: async () => {
        const result = await runHdcWithRetry(['list', 'targets']);
        if (!result.ok) {
            throw new Error(`Failed to list devices: ${result.error || result.stderr || 'unknown error'}`);
        }
        return parseDevices(result.stdout);
    },

    getDeviceProps: async (id) => {
        const [model, manufacturer, osVersion] = await Promise.all([
            runHdc(['-t', id, 'shell', 'param', 'get', 'const.product.model']),
            runHdc(['-t', id, 'shell', 'param', 'get', 'const.product.manufacturer']),
            runHdc(['-t', id, 'shell', 'param', 'get', 'hw_sc.build.os.version'])
        ]);
        return {
            model: (model.stdout || '').trim(),
            manufacturer: (manufacturer.stdout || '').trim(),
            androidVersion: (osVersion.stdout || '').trim() || 'HarmonyOS',
            sdkVersion: ''
        };
    },

    listForwards: async () => {
        const result = await runHdcWithRetry(['fport', 'ls']);
        return parseForwards(result.stdout);
    },

    discoverSockets: async (id) => {
        const result = await runHdc(['-t', id, 'shell', 'cat', '/proc/net/unix']);
        if (!result.ok) {
            return { ok: false, sockets: [], error: result.error || result.stderr };
        }
        return { ok: true, sockets: parseDevtoolsSockets(result.stdout) };
    },

    createForward: async (id, port, socket) => {
        const result = await runHdcWithRetry(['-t', id, 'fport', `tcp:${port}`, `localabstract:${socket}`]);
        return { ok: result.ok, error: result.error || result.stderr };
    },

    removeForward: async (id, localPort) => {
        const result = await runHdcWithRetry(['-t', id, 'fport', 'rm', `tcp:${localPort}`]);
        return { ok: result.ok, error: result.error || result.stderr };
    },

    startLogStream: async (id, webContents) => {
        if (!id) return { status: 'error', message: 'deviceId is required' };
        
        let streamData = activeLogStreams.get(id);
        
        if (!streamData) {
            const args = ['-t', id, 'hilog'];
            const newChild = spawn(getHdcPath(), args, { windowsHide: true });
            
            streamData = { child: newChild, subscribers: new Set() };
            activeLogStreams.set(id, streamData);

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
                    }, 50); // 50ms 缓冲防暴 IPC 洪水
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
                    if (!sub.isDestroyed()) sub.send('logcat-error', `Hilog process error: ${err.message}`);
                }
                activeLogStreams.delete(id);
            });

            newChild.on('close', (code) => {
                if (code !== 0 && code !== null) {
                    for (const sub of streamData.subscribers) {
                        if (!sub.isDestroyed()) sub.send('logcat-error', `Hilog process exited with code ${code}`);
                    }
                }
                activeLogStreams.delete(id);
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
                    activeLogStreams.delete(id);
                    streamData = null;
                }
            }
        };
        webContents.once('destroyed', cleanup);
        webContents.once('did-navigate', cleanup);

        return { status: 'success' };
    },

    stopLogStream: (id, webContents) => {
        const streamData = activeLogStreams.get(id);
        if (streamData && webContents) {
            streamData.subscribers.delete(webContents);
            if (streamData.subscribers.size === 0) {
                streamData.child.kill();
                activeLogStreams.delete(id);
            }
        }
    }
};
