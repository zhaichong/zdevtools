const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { withRetry, parseDevtoolsSockets, createLogStreamManager } = require('./baseDriver.js');

const HDC_TIMEOUT_MS = 6000;

let _cachedHdcPath = null;

function getHdcPath() {
    if (_cachedHdcPath) return _cachedHdcPath;
    const candidates = [
        path.join(__dirname, '..', '..', '..', 'bin', 'hdc.exe'),
        process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'hdc.exe') : null
    ].filter(Boolean);

    _cachedHdcPath = candidates.find(candidate => fs.existsSync(candidate)) || 'hdc';
    return _cachedHdcPath;
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
            return { id: parts[0], status: line.toLowerCase().includes('unauthorized') ? 'unauthorized' : line.toLowerCase().includes('offline') ? 'offline' : 'device' }; // HDC generally just lists connected targets
        });
}

function parseForwards(output) {
    // hdc fport ls
    // f4012241524a3131581562b11e9ebc00 tcp:9222 localabstract:webview_devtools_remote_1234
    // 注意：HDC 输出格式可能变化，部分版本不输出设备 ID
    return output.split(/\r?\n/).reduce((items, line) => {
        const matchNoId = line.match(/tcp:(\d+)\s+localabstract:(\S+)/);
        if (matchNoId) {
            const possibleIdMatch = line.match(/^([A-Za-z0-9_-]+)\s+tcp:/);
            const id = possibleIdMatch ? possibleIdMatch[1] : '*';  // 无法确定 ID 时标记为 *
            const port = Number.parseInt(matchNoId[1], 10);
            const socket = matchNoId[2];
            // 过滤掉解析失败的条目（端口为 NaN）
            if (!Number.isNaN(port) && socket) {
                items.push({ id, localPort: port, socket });
            }
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

/**
 * 探测本地常用网络映射端口（9222-9226）
 * 鸿蒙开发者可能用 hdc fport 或 DevEco 映射，这些不会出现在 /proc/net/unix
 * @param {string} deviceId - 主设备 ID（用于给探测到的 target 赋值）
 * @returns {Promise<Array>} - 探测到的 process 列表
 */
async function probeManualForwards(deviceId) {
    const probePorts = [9222, 9223, 9224, 9225, 9226];
    const processes = [];
    
    function requestJson(url, timeout = 1000) {
        return new Promise((resolve) => {
            let settled = false;
            const req = http.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (settled) return;
                    settled = true;
                    try {
                        resolve({ ok: true, data: JSON.parse(data) });
                    } catch (e) {
                        resolve({ ok: false, data: [] });
                    }
                });
            });
            req.on('error', () => {
                if (settled) return;
                settled = true;
                resolve({ ok: false, data: [] });
            });
            req.setTimeout(timeout, () => {
                if (!settled) {
                    settled = true;
                    resolve({ ok: false, data: [] });
                }
                req.destroy();
            });
        });
    }

    await Promise.all(probePorts.map(async (port) => {
        try {
            const result = await requestJson(`http://127.0.0.1:${port}/json/list`);
            if (result.ok && result.data && result.data.length > 0) {
                const targets = result.data.filter(t => ['page', 'webview'].includes(t.type) && (t.url || t.title));
                if (targets.length > 0) {
                    const enrichedTargets = targets.map(t => ({
                        id: t.id, type: t.type, title: t.title, url: t.url, description: t.description,
                        faviconUrl: t.faviconUrl, devtoolsFrontendUrl: t.devtoolsFrontendUrl,
                        webSocketDebuggerUrl: t.webSocketDebuggerUrl, localPort: port,
                        deviceId, processName: `hdc-fport-${port}`
                    }));
                    processes.push({
                        processName: `HDC Forward (${port})`,
                        processHint: 'Manual Mapping',
                        localPort: port,
                        forwardOk: true,
                        targets: enrichedTargets
                    });
                }
            }
        } catch (e) {
            // ignore if port is not open
        }
    }));
    return processes;
}

module.exports = {
    type: 'hdc',
    name: 'HarmonyOS HDC',

    checkAvailability: async () => {
        const result = await runHdcWithRetry(['-v']); // HDC version check is safer than list forwards
        if (!result.ok && /cannot|failed|not found|ENOENT|not recognized/i.test(result.error + result.stderr)) {
            return { available: false, error: (result.error || result.stderr || 'unknown error') + (result.error && result.error.includes('ENOENT') ? ' (未在 bin/ 或 PATH 找到 hdc.exe)' : '') };
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

    removeAllForwards: async () => {
        // HDC 没有类似 adb forward --remove-all 的单条命令，逐个移除
        const result = await runHdcWithRetry(['fport', 'ls']);
        if (!result.ok) return { ok: false, error: result.error || result.stderr };
        const forwards = parseForwards(result.stdout);
        let failedCount = 0;
        let lastError = '';
        for (const f of forwards) {
            const id = f.id === '*' ? '' : f.id;
            const args = id ? ['-t', id, 'fport', 'rm', `tcp:${f.localPort}`] : ['fport', 'rm', `tcp:${f.localPort}`];
            const removeResult = await runHdc(args);
            if (!removeResult.ok) {
                failedCount++;
                lastError = removeResult.error || removeResult.stderr;
            }
        }
        if (failedCount > 0) {
            return { ok: false, error: `Failed to remove ${failedCount}/${forwards.length} forwards. Last error: ${lastError}` };
        }
        return { ok: true };
    },

    startLogStream: logStream.startLogStream,
    stopLogStream: logStream.stopLogStream,
    killAllLogStreams: logStream.killAll,
    
    /**
     * HarmonyOS 专属：探测手动映射的端口（9222-9226）
     * 这些端口由 DevEco 或手动 hdc fport 创建，不会出现在 /proc/net/unix
     */
    probeManualForwards
};
