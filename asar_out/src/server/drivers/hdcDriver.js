const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { withRetry, parseDevtoolsSockets, createLogStreamManager } = require('./baseDriver.js');

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

// 日志流管理器（共享订阅者模式）
const logStream = createLogStreamManager({
    getToolPath: getHdcPath,
    buildArgs: (id) => ['-t', id, 'hilog'],
    errorLabel: 'Hilog'
});

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

    startLogStream: logStream.startLogStream,
    stopLogStream: logStream.stopLogStream,
    killAllLogStreams: logStream.killAll
};
