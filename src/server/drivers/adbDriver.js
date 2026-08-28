const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { withRetry, parseDevtoolsSockets, normalizeAbstractSocket, createLogStreamManager } = require('./baseDriver.js');

const ADB_TIMEOUT_MS = 6000;

let _cachedAdbPath = null;

function getAdbPath() {
    if (_cachedAdbPath) return _cachedAdbPath;
    const candidates = [
        path.join(__dirname, '..', '..', '..', 'bin', 'adb.exe'),
        process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'adb.exe') : null
    ].filter(Boolean);

    _cachedAdbPath = candidates.find(candidate => fs.existsSync(candidate)) || 'adb';
    return _cachedAdbPath;
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
    return (output || '').split(/\r?\n/).reduce((items, line) => {
        const trimmed = line.trim();
        const abstractMatch = trimmed.match(/^(\S+)\s+tcp:(\d+)\s+localabstract:(\S+)/);
        if (abstractMatch) {
            items.push({
                id: abstractMatch[1],
                localPort: Number.parseInt(abstractMatch[2], 10),
                socket: normalizeAbstractSocket(abstractMatch[3]),
                kind: 'abstract'
            });
            return items;
        }
        const tcpMatch = trimmed.match(/^(\S+)\s+tcp:(\d+)\s+tcp:(\d+)/);
        if (tcpMatch) {
            items.push({
                id: tcpMatch[1],
                localPort: Number.parseInt(tcpMatch[2], 10),
                remotePort: Number.parseInt(tcpMatch[3], 10),
                socket: `tcp:${tcpMatch[3]}`,
                kind: 'tcp'
            });
        }
        return items;
    }, []);
}

// 日志流管理器（共享订阅者模式）
const logStream = createLogStreamManager({
    getToolPath: getAdbPath,
    buildArgs: (id) => ['-s', id, 'logcat', '-b', 'main', '-b', 'system', '-b', 'crash', '-v', 'time', '-T', '200'],
    errorLabel: 'Logcat'
});

module.exports = {
    type: 'adb',
    name: 'Android ADB',
    parseForwards,

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

    removeAllForwards: async () => {
        const result = await runAdbWithRetry(['forward', '--remove-all']);
        return { ok: result.ok, error: result.error || result.stderr };
    },

    startLogStream: logStream.startLogStream,
    stopLogStream: logStream.stopLogStream,
    killAllLogStreams: logStream.killAll
};
