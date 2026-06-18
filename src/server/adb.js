const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

const ADB_TIMEOUT_MS = 6000;
const TARGET_TIMEOUT_MS = 2500;

function getAdbPath() {
    const candidates = [
        path.join(__dirname, '..', '..', 'bin', 'adb.exe'),
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

function requestJson(url, timeout = TARGET_TIMEOUT_MS) {
    return new Promise((resolve) => {
        let settled = false;
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (settled) return;
                settled = true;
                try {
                    resolve({ ok: true, statusCode: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ ok: false, statusCode: res.statusCode, data: [], error: e.message });
                }
            });
        });
        req.on('error', error => {
            if (settled) return;
            settled = true;
            resolve({ ok: false, data: [], error: error.message });
        });
        req.setTimeout(timeout, () => {
            req.destroy(new Error('timeout'));
        });
    });
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

async function getDeviceProps(id) {
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
}

function parseDevtoolsSockets(output) {
    const socketMatches = [...output.matchAll(/@([A-Za-z0-9_.-]*devtools_remote[A-Za-z0-9_.-]*)/g)];
    return [...new Set(socketMatches.map(match => match[1]))];
}

function getProcessHint(socket) {
    if (socket === 'webview_devtools_remote') return 'system-webview';
    const pidMatch = socket.match(/(?:webview_)?devtools_external_(\d+)/);
    if (pidMatch) return `pid:${pidMatch[1]}`;
    return socket.replace(/^@/, '');
}

async function ensureForward(deviceId, socket, existingForwards) {
    const existing = existingForwards.find(item => item.id === deviceId && item.socket === socket);
    if (existing) return { ok: true, localPort: existing.localPort, reused: true };

    for (let port = 9220; port < 9400; port++) {
        if (existingForwards.some(item => item.localPort === port)) continue;
        const forward = await runAdb(['-s', deviceId, 'forward', `tcp:${port}`, `localabstract:${socket}`]);
        if (forward.ok) {
            existingForwards.push({ id: deviceId, localPort: port, socket });
            return { ok: true, localPort: port, reused: false };
        }
    }
    return { ok: false, error: 'No available local port in 9220-9399' };
}

async function getAdbTargets() {
    const diagnostics = {
        adbPath: getAdbPath(),
        adbAvailable: true,
        adbPortOk: true,
        adbPortProcess: null,
        messages: []
    };

    const forwards = await runAdb(['forward', '--list']);
    if (!forwards.ok && /cannot|failed|not found|ENOENT/i.test(forwards.error + forwards.stderr)) {
        diagnostics.adbAvailable = false;
        diagnostics.messages.push({ level: 'error', message: `ADB unavailable: ${forwards.error || forwards.stderr || 'unknown error'}` });
    }

    const existingForwards = parseForwards(forwards.stdout);
    const deviceResult = await runAdb(['devices']);
    if (!deviceResult.ok) {
        diagnostics.messages.push({ level: 'error', message: `Failed to list devices: ${deviceResult.error || deviceResult.stderr || 'unknown error'}` });
        return { status: 'error', diagnostics, devices: [] };
    }

    const devices = [];
    const parsedDevices = parseDevices(deviceResult.stdout);

    for (const baseDevice of parsedDevices) {
        const device = {
            ...baseDevice, model: '', manufacturer: '', androidVersion: '', sdkVersion: '',
            processes: [], diagnostics: []
        };

        if (device.status === 'unauthorized') {
            device.diagnostics.push('Device is unauthorized. Unlock the device and allow USB debugging.');
            devices.push(device);
            continue;
        }
        if (device.status === 'offline') {
            device.diagnostics.push('Device is offline. Reconnect USB or restart USB debugging.');
            devices.push(device);
            continue;
        }

        Object.assign(device, await getDeviceProps(device.id));

        const socketsResult = await runAdb(['-s', device.id, 'shell', 'cat', '/proc/net/unix']);
        if (!socketsResult.ok) {
            device.diagnostics.push(`Failed to read WebView sockets: ${socketsResult.error || socketsResult.stderr}`);
            devices.push(device);
            continue;
        }

        const sockets = parseDevtoolsSockets(socketsResult.stdout);
        if (sockets.length === 0) {
            device.diagnostics.push('No debuggable WebView target found. Check WebView.setWebContentsDebuggingEnabled(true).');
        }

        for (const socket of sockets) {
            const forward = await ensureForward(device.id, socket, existingForwards);
            const processInfo = {
                processName: socket, processHint: getProcessHint(socket),
                localPort: forward.localPort || null, forwardReused: Boolean(forward.reused),
                forwardOk: forward.ok, targets: [], diagnostics: []
            };

            if (!forward.ok) {
                processInfo.diagnostics.push(forward.error || 'Forward failed');
                device.processes.push(processInfo);
                continue;
            }

            const targetResult = await requestJson(`http://127.0.0.1:${forward.localPort}/json/list`);
            if (!targetResult.ok) {
                processInfo.diagnostics.push(`Failed to read /json/list: ${targetResult.error || targetResult.statusCode}`);
            } else {
                processInfo.targets = (targetResult.data || []).map(target => ({
                    id: target.id, type: target.type, title: target.title, url: target.url,
                    description: target.description, faviconUrl: target.faviconUrl,
                    devtoolsFrontendUrl: target.devtoolsFrontendUrl,
                    webSocketDebuggerUrl: target.webSocketDebuggerUrl,
                    localPort: forward.localPort, deviceId: device.id, processName: socket
                }));
            }
            device.processes.push(processInfo);
        }
        devices.push(device);
    }

    if (devices.length === 0) {
        diagnostics.messages.push({ level: 'warn', message: 'No Android device detected.' });
    }

    return { status: 'success', diagnostics, devices };
}

function redactSensitive(text) {
    return String(text || '')
        .replace(/(access_token|token|password|client_secret|Authorization)(["'\s:=]+)([^"',\s&]+)/gi, '$1$2[REDACTED]')
        .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}

async function getLogcat(deviceId) {
    if (!deviceId) return { status: 'error', message: 'deviceId is required', lines: [] };
    const result = await runAdb(['-s', deviceId, 'logcat', '-d', '-v', 'time', '-t', '500'], 9000);
    if (!result.ok) {
        return { status: 'error', message: result.error || result.stderr || 'logcat failed', lines: [] };
    }
    const keywords = /(chromium|webview|console|pageLoadFinished|toLogInE|toLogInI|writeLog|LocalInspect|zhbf|zhct|NurseNtv|error|exception|crash|mqtt|mattress)/i;
    const lines = result.stdout
        .split(/\r?\n/)
        .filter(line => keywords.test(line))
        .slice(-200)
        .map(redactSensitive);
    return { status: 'success', lines };
}

async function restartAdb() {
    const kill = await runAdb(['kill-server'], 5000);
    const start = await runAdb(['start-server'], 5000);
    return { status: kill.ok && start.ok ? 'success' : 'error', kill, start };
}

function findFreePort(startPort) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.on('error', () => resolve(findFreePort(startPort + 1)));
        server.listen(startPort, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

module.exports = {
    getAdbPath, runAdb, getAdbTargets, getLogcat, restartAdb, findFreePort
};
