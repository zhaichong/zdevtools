const { execFile, spawn } = require('child_process');
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

/**
 * ADB 操作重试包装器 — 对关键操作自动重试（指数退避）
 * @param {Function} fn - 返回 { ok, ... } 的异步函数
 * @param {object} [options]
 * @param {number} [options.maxRetries=3]
 * @param {number} [options.baseDelay=1000]
 * @returns {Function} 包装后的函数，签名与原函数一致
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

// 对关键 ADB 操作应用重试
const runAdbWithRetry = withRetry(runAdb, { maxRetries: 3, baseDelay: 1000 });

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

/**
 * 发现设备上的 WebView 调试 socket（纯查询，无副作用）
 */
async function discoverDeviceSockets(deviceId) {
    const socketsResult = await runAdb(['-s', deviceId, 'shell', 'cat', '/proc/net/unix']);
    if (!socketsResult.ok) {
        return { ok: false, sockets: [], error: socketsResult.error || socketsResult.stderr };
    }
    const sockets = parseDevtoolsSockets(socketsResult.stdout);
    return { ok: true, sockets, error: '' };
}

/**
 * 为所有需要的 socket 预分配本地端口，避免并行 forward 时的端口竞态
 * @param {{ deviceId: string, socket: string }[]} socketEntries
 * @param {object[]} existingForwards
 * @returns {{ ok: boolean, portMap: Map<string, {port: number, reused: boolean}>, error?: string }}
 */
function preAllocatePorts(socketEntries, existingForwards) {
    const portMap = new Map();
    const usedPorts = new Set(existingForwards.map(f => f.localPort));

    // 先映射已有的 forward（复用）
    for (const entry of socketEntries) {
        const existing = existingForwards.find(f => f.id === entry.deviceId && f.socket === entry.socket);
        if (existing) {
            portMap.set(`${entry.deviceId}:${entry.socket}`, { port: existing.localPort, reused: true });
        }
    }

    // 为没有已有 forward 的 socket 分配新端口
    let nextPort = 9220;
    for (const entry of socketEntries) {
        const key = `${entry.deviceId}:${entry.socket}`;
        if (portMap.has(key)) continue;
        while (usedPorts.has(nextPort) || [...portMap.values()].some(v => v.port === nextPort)) {
            nextPort++;
        }
        if (nextPort > 9399) {
            return { ok: false, portMap, error: 'No available local port in 9220-9399' };
        }
        usedPorts.add(nextPort);
        portMap.set(key, { port: nextPort, reused: false });
    }
    return { ok: true, portMap };
}

/**
 * 创建单个 ADB forward（仅在未复用时执行）
 */
async function createForward(deviceId, socket, portInfo) {
    if (portInfo.reused) return { ok: true, localPort: portInfo.port, reused: true };
    const forward = await runAdbWithRetry(['-s', deviceId, 'forward', `tcp:${portInfo.port}`, `localabstract:${socket}`]);
    if (forward.ok) {
        return { ok: true, localPort: portInfo.port, reused: false };
    }
    return { ok: false, error: `ADB forward failed for ${socket}: ${forward.error || forward.stderr}` };
}

/**
 * 处理单台设备（纯函数式，不修改共享状态）
 */
async function processDevice(baseDevice, portMap, existingForwards) {
    const device = {
        ...baseDevice, model: '', manufacturer: '', androidVersion: '', sdkVersion: '',
        processes: [], diagnostics: []
    };

    if (device.status === 'unauthorized') {
        device.diagnostics.push('Device is unauthorized. Unlock the device and allow USB debugging.');
        return device;
    }
    if (device.status === 'offline') {
        device.diagnostics.push('Device is offline. Reconnect USB or restart USB debugging.');
        return device;
    }

    // 获取设备属性
    Object.assign(device, await getDeviceProps(device.id));

    // 发现 WebView 调试 socket
    const socketsInfo = await discoverDeviceSockets(device.id);
    if (!socketsInfo.ok) {
        device.diagnostics.push(`Failed to read WebView sockets: ${socketsInfo.error}`);
        return device;
    }

    const sockets = socketsInfo.sockets;
    if (sockets.length === 0) {
        device.diagnostics.push('No debuggable WebView target found. Check WebView.setWebContentsDebuggingEnabled(true).');
    }

    // 并行处理所有 socket：创建 forward + 获取 targets
    const processResults = await Promise.all(sockets.map(async (socket) => {
        const key = `${device.id}:${socket}`;
        const portInfo = portMap.get(key);
        const processInfo = {
            processName: socket, processHint: getProcessHint(socket),
            localPort: portInfo ? portInfo.port : null, forwardReused: Boolean(portInfo?.reused),
            forwardOk: false, targets: [], diagnostics: []
        };

        if (!portInfo) {
            processInfo.diagnostics.push('Port not pre-allocated');
            return processInfo;
        }

        const forward = await createForward(device.id, socket, portInfo);
        processInfo.forwardOk = forward.ok;
        processInfo.localPort = forward.localPort || null;
        processInfo.forwardReused = Boolean(forward.reused);

        if (!forward.ok) {
            processInfo.diagnostics.push(forward.error || 'Forward failed');
            return processInfo;
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
        return processInfo;
    }));

    device.processes = processResults;
    return device;
}

async function getAdbTargets() {
    const startTime = Date.now();
    const diagnostics = {
        adbPath: getAdbPath(),
        adbAvailable: true,
        adbPortOk: true,
        adbPortProcess: null,
        messages: []
    };

    // Phase 1: 并行获取基础信息（关键操作使用重试包装）
    const [forwards, deviceResult] = await Promise.all([
        runAdbWithRetry(['forward', '--list']),
        runAdbWithRetry(['devices'])
    ]);

    if (!forwards.ok && /cannot|failed|not found|ENOENT/i.test(forwards.error + forwards.stderr)) {
        diagnostics.adbAvailable = false;
        diagnostics.messages.push({ level: 'error', message: `ADB unavailable: ${forwards.error || forwards.stderr || 'unknown error'}` });
    }

    if (!deviceResult.ok) {
        diagnostics.messages.push({ level: 'error', message: `Failed to list devices: ${deviceResult.error || deviceResult.stderr || 'unknown error'}` });
        return { status: 'error', diagnostics, devices: [] };
    }

    const existingForwards = parseForwards(forwards.stdout);
    const parsedDevices = parseDevices(deviceResult.stdout);

    if (parsedDevices.length === 0) {
        diagnostics.messages.push({ level: 'warn', message: 'No Android device detected.' });
        return { status: 'success', diagnostics, devices: [] };
    }

    // Phase 2: 并行发现所有设备的 socket（仅查询，无副作用）
    const onlineDevices = parsedDevices.filter(d => d.status === 'device');
    const socketDiscoveries = await Promise.all(
        onlineDevices.map(async (d) => {
            const socketsInfo = await discoverDeviceSockets(d.id);
            return { deviceId: d.id, sockets: socketsInfo.ok ? socketsInfo.sockets : [] };
        })
    );

    // Phase 3: 收集所有需要 forward 的 socket，预分配端口
    const allSocketEntries = socketDiscoveries.flatMap(d =>
        d.sockets.map(socket => ({ deviceId: d.deviceId, socket }))
    );
    const { portMap, error: portError } = preAllocatePorts(allSocketEntries, existingForwards);
    if (portError) {
        diagnostics.messages.push({ level: 'warn', message: `Port allocation warning: ${portError}` });
    }

    // Phase 4: 并行处理所有设备
    const devices = await Promise.all(
        parsedDevices.map(baseDevice => processDevice(baseDevice, portMap, existingForwards))
    );

    console.log(`[adb] getAdbTargets completed in ${Date.now() - startTime}ms for ${devices.length} device(s)`);

    return { status: 'success', diagnostics, devices };
}

function redactSensitive(text) {
    return String(text || '')
        .replace(/(access_token|token|password|client_secret|Authorization)(["'\s:=]+)([^"',\s&]+)/gi, '$1$2[REDACTED]')
        .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}

async function getLogcat(deviceId, since) {
    if (!deviceId) return { status: 'error', message: 'deviceId is required', lines: [] };
    // -d = dump 设备缓冲区全部内容后退出（设备缓冲区自带环形淘汰，无需 -t 限制）
    // -T <timestamp> = 只取该时间之后的行，实现增量拉取
    const args = ['-s', deviceId, 'logcat', '-d', '-v', 'time'];
    if (since) args.push('-T', since);
    // 使用 spawn 流式收集 stdout，不受 execFile 的 1MB maxBuffer 限制
    return new Promise((resolve) => {
        const child = spawn(getAdbPath(), args, {
            windowsHide: true
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill();
            resolve({ status: 'error', message: 'logcat timed out after 15s', lines: [] });
        }, 15000);
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({ status: 'error', message: err.message, lines: [] });
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                resolve({ status: 'error', message: stderr || `logcat exited with code ${code}`, lines: [] });
                return;
            }
            const lines = stdout
                .split(/\r?\n/)
                .filter(line => line.trim())
                .map(redactSensitive);
            resolve({ status: 'success', lines });
        });
    });
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
