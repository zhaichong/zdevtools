const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ADB_TIMEOUT_MS = 6000;

function getAdbPath() {
    const candidates = [
        path.join(__dirname, '..', '..', '..', 'bin', 'adb.exe'),
        process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'adb.exe') : null
    ].filter(Boolean);

    const adbPath = candidates.find(candidate => fs.existsSync(candidate));
    return adbPath || 'adb';
}

function runAdb(args, timeout = ADB_TIMEOUT_MS) {
    return new Promise((resolve) => {
        execFile(getAdbPath(), args, { timeout, windowsHide: true }, (error, stdout, stderr) => {
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

const runAdbWithRetry = withRetry(runAdb, { maxRetries: 3, baseDelay: 1000 });

function parseDevices(output) {
    return output.split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('List'))
        .map(line => {
            const parts = line.split(/\s+/);
            return { id: parts[0], status: parts[1] };
        })
        .filter(device => ['device', 'offline', 'unauthorized'].includes(device.status));
}

function parseForwards(output) {
    return output.split(/\r?\n/).reduce((items, line) => {
        const match = line.match(/^(\S+)\s+tcp:(\d+)\s+localabstract:(\S+)/);
        if (match) {
            items.push({ id: match[1], localPort: Number.parseInt(match[2], 10), socket: match[3] });
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

const activeLogcatStreams = new Map();

module.exports = {
    type: 'adb',
    name: 'Android ADB',

    checkAvailability: async () => {
        const result = await runAdbWithRetry(['forward', '--list']);
        if (!result.ok && /cannot|failed|not found|ENOENT/i.test(result.error + result.stderr)) {
            return { available: false, error: result.error || result.stderr || 'unknown error' };
        }
        return { available: true };
    },

    listDevices: async () => {
        const result = await runAdbWithRetry(['devices']);
        if (!result.ok) {
            throw new Error(`Failed to list devices: ${result.error || result.stderr || 'unknown error'}`);
        }
        return parseDevices(result.stdout);
    },

    getDeviceProps: async (id) => {
        const [model, androidVersion, sdkVersion, manufacturer] = await Promise.all([
            runAdb(['-s', id, 'shell', 'getprop', 'ro.product.model']),
            runAdb(['-s', id, 'shell', 'getprop', 'ro.build.version.release']),
            runAdb(['-s', id, 'shell', 'getprop', 'ro.build.version.sdk']),
            runAdb(['-s', id, 'shell', 'getprop', 'ro.product.manufacturer'])
        ]);
        return {
            model: model.stdout.trim(),
            androidVersion: androidVersion.stdout.trim(),
            sdkVersion: sdkVersion.stdout.trim(),
            manufacturer: manufacturer.stdout.trim()
        };
    },

    listForwards: async () => {
        const result = await runAdbWithRetry(['forward', '--list']);
        return parseForwards(result.stdout);
    },

    discoverSockets: async (id) => {
        const result = await runAdb(['-s', id, 'shell', 'cat', '/proc/net/unix']);
        if (!result.ok) {
            return { ok: false, sockets: [], error: result.error || result.stderr };
        }
        return { ok: true, sockets: parseDevtoolsSockets(result.stdout) };
    },

    createForward: async (id, port, socket) => {
        const result = await runAdbWithRetry(['-s', id, 'forward', `tcp:${port}`, `localabstract:${socket}`]);
        return { ok: result.ok, error: result.error || result.stderr };
    },

    removeForward: async (id, localPort) => {
        const result = await runAdbWithRetry(['-s', id, 'forward', '--remove', `tcp:${localPort}`]);
        return { ok: result.ok, error: result.error || result.stderr };
    },

    startLogStream: async (id, webContents) => {
        if (!id) return { status: 'error', message: 'deviceId is required' };
        
        let streamData = activeLogcatStreams.get(id);
        
        if (!streamData) {
            const args = ['-s', id, 'logcat', '-v', 'time', '-T', '1'];
            const newChild = spawn(getAdbPath(), args, { windowsHide: true });
            
            streamData = { child: newChild, subscribers: new Set() };
            activeLogcatStreams.set(id, streamData);

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
                    if (!sub.isDestroyed()) sub.send('logcat-error', `Logcat process error: ${err.message}`);
                }
                activeLogcatStreams.delete(id);
            });

            newChild.on('close', (code) => {
                if (code !== 0 && code !== null) {
                    for (const sub of streamData.subscribers) {
                        if (!sub.isDestroyed()) sub.send('logcat-error', `Logcat process exited with code ${code}`);
                    }
                }
                activeLogcatStreams.delete(id);
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
                    activeLogcatStreams.delete(id);
                    streamData = null;
                }
            }
        };
        webContents.once('destroyed', cleanup);
        webContents.once('did-navigate', cleanup);

        return { status: 'success' };
    },

    stopLogStream: (id, webContents) => {
        const streamData = activeLogcatStreams.get(id);
        if (streamData && webContents) {
            streamData.subscribers.delete(webContents);
            if (streamData.subscribers.size === 0) {
                streamData.child.kill();
                activeLogcatStreams.delete(id);
            }
        }
    }
};
