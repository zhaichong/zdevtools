const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { withRetry, parseDevtoolsSockets, createLogStreamManager } = require('./baseDriver.js');
const { FORWARD_PORT_MIN, FORWARD_PORT_MAX } = require('../constants.js');

const HDC_TIMEOUT_MS = 6000;
const HDC_TCP_PROBE_PORTS = [9222, 9223, 9224, 9225, 9226];

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

/**
 * 解析 hdc fport ls 输出。
 * 支持：
 * - abstract: [id] tcp:LOCAL localabstract:SOCKET
 * - tcp→tcp:  [id] tcp:LOCAL tcp:REMOTE （含引号/制表符，如 'tcp:9222 tcp:9222'\t[Forward]）
 *
 * @returns {Array<{id:string, localPort:number, socket:string, kind:'abstract'|'tcp', remotePort?:number}>}
 */
function parseForwards(output) {
    return (output || '').split(/\r?\n/).reduce((items, rawLine) => {
        // 去掉 hdc 可能包在规则两侧的单引号，以及尾部 [Forward] 标记
        const line = rawLine
            .replace(/^\s*'/, '')
            .replace(/'\s*(?:\[Forward\])?\s*$/i, '')
            .replace(/\s*\[Forward\]\s*$/i, '')
            .trim();
        if (!line) return items;

        // 设备 ID 不能是 tcp:/localabstract: 前缀本身（避免 'tcp:9222 tcp:9222' 误解析）
        const possibleIdMatch = line.match(/^([A-Za-z0-9_.:-]+)\s+tcp:/i);
        let id = '*';
        if (possibleIdMatch && !/^tcp:/i.test(possibleIdMatch[1]) && !/^localabstract:/i.test(possibleIdMatch[1])) {
            id = possibleIdMatch[1];
        }

        const abstractMatch = line.match(/tcp:(\d+)\s+localabstract:(\S+)/i);
        if (abstractMatch) {
            const port = Number.parseInt(abstractMatch[1], 10);
            const socket = abstractMatch[2];
            if (!Number.isNaN(port) && socket) {
                items.push({ id, localPort: port, socket, kind: 'abstract' });
            }
            return items;
        }

        const tcpMatch = line.match(/tcp:(\d+)\s+tcp:(\d+)/i);
        if (tcpMatch) {
            const localPort = Number.parseInt(tcpMatch[1], 10);
            const remotePort = Number.parseInt(tcpMatch[2], 10);
            if (!Number.isNaN(localPort) && !Number.isNaN(remotePort)) {
                items.push({
                    id,
                    localPort,
                    remotePort,
                    socket: `tcp:${remotePort}`,
                    kind: 'tcp'
                });
            }
        }
        return items;
    }, []);
}

function shouldProbeExistingTcpPort(deviceId, port, forwards, claimedPorts, { allowUnowned = false } = {}) {
    const forward = (forwards || []).find(item => item.kind === 'tcp' && item.localPort === port);
    if (forward?.id === deviceId) return true;
    if (forward?.id && forward.id !== '*') return false;
    return allowUnowned && !claimedPorts?.has(port);
}

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

function isLocalPortFree(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.unref();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => {
            server.close(() => resolve(true));
        });
    });
}

async function findFreeLocalPort(preferred, usedPorts) {
    const tryPort = async (port) => {
        if (usedPorts.has(port)) return null;
        if (await isLocalPortFree(port)) return port;
        return null;
    };

    if (preferred != null) {
        const hit = await tryPort(preferred);
        if (hit != null) return hit;
    }

    for (let port = FORWARD_PORT_MIN; port <= FORWARD_PORT_MAX; port++) {
        const hit = await tryPort(port);
        if (hit != null) return hit;
    }
    return null;
}

function extractPageTargets(list, deviceId, localPort, processName) {
    return (list || [])
        .filter(t => Boolean(t && t.id && (['page', 'webview', 'other'].includes(t.type) || t.webSocketDebuggerUrl)))
        .map(t => ({
            id: t.id,
            type: t.type || 'page',
            title: t.title || t.url || `WebView (${t.id.slice(0, 8)})`,
            url: t.url || '',
            description: t.description || '',
            faviconUrl: t.faviconUrl || '',
            devtoolsFrontendUrl: t.devtoolsFrontendUrl || '',
            webSocketDebuggerUrl: t.webSocketDebuggerUrl || '',
            localPort,
            deviceId,
            processName
        }));
}

// 日志流管理器（共享订阅者模式）
const logStream = createLogStreamManager({
    getToolPath: getHdcPath,
    buildArgs: (id) => ['-t', id, 'hilog'],
    errorLabel: 'Hilog'
});

/**
 * 探测 / 主动建立鸿蒙 Web 调试 TCP 映射（9222-9226）
 * 鸿蒙 NWeb/ArkWeb 通常在设备侧监听 TCP 9222，而不是 Android 的 localabstract devtools_remote。
 * @param {string} deviceId
 * @param {{ usedPorts?: Iterable<number> }} [options]
 * @returns {Promise<Array>} process 列表（与 abstract 路径结构一致）
 */
async function probeManualForwards(deviceId, options = {}) {
    const usedPorts = new Set(options.usedPorts || []);
    const claimedPorts = options.claimedPorts || new Set();
    const processes = [];
    const seenTargetIds = new Set();

    const pushProcess = (localPort, targets, hint, createdRemotePort = null) => {
        const fresh = targets.filter(t => {
            if (seenTargetIds.has(t.id)) return false;
            seenTargetIds.add(t.id);
            return true;
        });
        // Target IDs are only unique within one CDP endpoint. Even if this endpoint
        // contributes no new UI target, retain ownership of a forward we created so
        // teardown can remove it.
        if (fresh.length === 0 && createdRemotePort == null) return;
        usedPorts.add(localPort);
        claimedPorts.add(localPort);
        processes.push({
            processName: `HDC Forward (${localPort})`,
            processHint: hint || 'TCP Mapping',
            localPort,
            forwardOk: true,
            targets: fresh,
            ownedForward: createdRemotePort == null ? null : {
                localPort,
                remotePort: createdRemotePort,
                socket: `tcp:${createdRemotePort}`
            }
        });
    };

    // 先读取转发表，避免把同一个本地 TCP 端口错误归属给每台已连接设备。
    let existingForwards = [];
    try {
        const fwResult = await runHdc(['fport', 'ls']);
        existingForwards = parseForwards(fwResult.stdout || '');
    } catch (e) {
        existingForwards = [];
    }

    // 1) 先扫本机已有监听（DevEco / 手工映射 / 上次遗留）
    await Promise.all(HDC_TCP_PROBE_PORTS.map(async (port) => {
        if (!shouldProbeExistingTcpPort(deviceId, port, existingForwards, claimedPorts, {
            allowUnowned: options.allowUnownedExisting
        })) return;
        try {
            const result = await requestJson(`http://127.0.0.1:${port}/json/list`);
            if (result.ok && result.data?.length) {
                const targets = extractPageTargets(result.data, deviceId, port, `hdc-fport-${port}`);
                if (targets.length > 0) {
                    pushProcess(port, targets, 'Existing Mapping');
                }
            }
        } catch (e) {
            // ignore
        }
    }));

    // 已覆盖全部候选端口则无需再建 forward
    if (processes.length > 0 && HDC_TCP_PROBE_PORTS.every(p => usedPorts.has(p) || processes.some(pr => pr.localPort === p))) {
        // 仍可能有未命中的 remote；继续下面逻辑补漏
    }

    // 2) 解析已有 fport，优先复用 tcp→tcp
    for (const fw of existingForwards) {
        if (fw.localPort) usedPorts.add(fw.localPort);
    }

    for (const remotePort of HDC_TCP_PROBE_PORTS) {
        // 该 remote 是否已通过上面的本机扫描拿到 target
        if (processes.some(p => p.targets?.some(t => t.localPort === p.localPort) && p.localPort === remotePort)) {
            continue;
        }
        // 已有指向该 remote 的 tcp forward
        const existing = existingForwards.find(f =>
            f.kind === 'tcp' &&
            f.remotePort === remotePort &&
            (f.id === '*' || f.id === deviceId)
        );
        if (existing) {
            if (!shouldProbeExistingTcpPort(deviceId, existing.localPort, existingForwards, claimedPorts, {
                allowUnowned: options.allowUnownedExisting
            })) continue;
            try {
                const result = await requestJson(`http://127.0.0.1:${existing.localPort}/json/list`);
                if (result.ok && result.data?.length) {
                    const targets = extractPageTargets(
                        result.data, deviceId, existing.localPort, `hdc-fport-${existing.localPort}`
                    );
                    if (targets.length > 0) {
                        pushProcess(existing.localPort, targets, 'Reused TCP Forward');
                        continue;
                    }
                }
            } catch (e) {
                // fall through to recreate
            }
        }

        // 3) 主动建立 tcp→tcp：优先 local==remote
        // 若本机该端口已在 processes 中出过 target，跳过
        if (processes.some(p => p.localPort === remotePort && p.targets?.length)) continue;

        const localPort = await findFreeLocalPort(remotePort, usedPorts);
        if (localPort == null) continue;

        const forwardResult = await runHdcWithRetry([
            '-t', deviceId, 'fport', `tcp:${localPort}`, `tcp:${remotePort}`
        ]);
        let createdByUs = forwardResult.ok;

        // 部分 hdc 在规则已存在时返回非 0；仍尝试探测
        try {
            const result = await requestJson(`http://127.0.0.1:${localPort}/json/list`);
            if (result.ok && result.data?.length) {
                const targets = extractPageTargets(result.data, deviceId, localPort, `hdc-fport-${localPort}`);
                if (targets.length > 0) {
                    pushProcess(localPort, targets, createdByUs ? 'TCP Mapping' : 'Existing Mapping', createdByUs ? remotePort : null);
                    continue;
                }
            }
        } catch (e) {
            // ignore
        }

        // 新建但无 CDP 响应：清掉空规则，避免堆积僵尸 fport
        if (createdByUs) {
            await runHdc(['fport', 'rm', `tcp:${localPort}`, `tcp:${remotePort}`]);
        }
    }

    return processes;
}

module.exports = {
    type: 'hdc',
    name: 'HarmonyOS HDC',
    parseForwards,
    shouldProbeExistingTcpPort,

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

    createTcpForward: async (id, localPort, remotePort) => {
        const result = await runHdcWithRetry(['-t', id, 'fport', `tcp:${localPort}`, `tcp:${remotePort}`]);
        return { ok: result.ok, error: result.error || result.stderr };
    },

    removeForward: async (id, localPort) => {
        // hdc 删除规则时：优先带完整规则两端，失败再退回只删 local
        const listed = await runHdc(['fport', 'ls']);
        const forwards = parseForwards(listed.stdout || '');
        const match = forwards.find(f => f.localPort === localPort && (f.id === '*' || !id || f.id === id));
        if (match) {
            const remote = match.kind === 'tcp'
                ? `tcp:${match.remotePort}`
                : `localabstract:${match.socket}`;
            const fullArgs = id
                ? ['-t', id, 'fport', 'rm', `tcp:${localPort}`, remote]
                : ['fport', 'rm', `tcp:${localPort}`, remote];
            // 不带 -t 的形式（hdc 对部分版本更稳）
            const plainArgs = ['fport', 'rm', `tcp:${localPort}`, remote];
            let result = await runHdc(plainArgs);
            if (!result.ok) result = await runHdc(fullArgs);
            if (result.ok) return { ok: true, error: '' };
        }
        const fallback = id
            ? await runHdcWithRetry(['-t', id, 'fport', 'rm', `tcp:${localPort}`])
            : await runHdcWithRetry(['fport', 'rm', `tcp:${localPort}`]);
        return { ok: fallback.ok, error: fallback.error || fallback.stderr };
    },

    removeAllForwards: async () => {
        // HDC 没有类似 adb forward --remove-all 的单条命令，逐个移除
        const result = await runHdcWithRetry(['fport', 'ls']);
        if (!result.ok) return { ok: false, error: result.error || result.stderr };
        const forwards = parseForwards(result.stdout);
        let failedCount = 0;
        let lastError = '';
        for (const f of forwards) {
            const remote = f.kind === 'tcp'
                ? `tcp:${f.remotePort}`
                : `localabstract:${f.socket}`;
            // 实测 hdc 需要 `fport rm tcp:L tcp:R` 两端，单 local 会 Fail
            let removeResult = await runHdc(['fport', 'rm', `tcp:${f.localPort}`, remote]);
            if (!removeResult.ok && f.id && f.id !== '*') {
                removeResult = await runHdc(['-t', f.id, 'fport', 'rm', `tcp:${f.localPort}`, remote]);
            }
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
     * HarmonyOS 专属：探测/建立 TCP 调试映射（9222-9226）
     * 这些端口由 NWeb/ArkWeb 或 DevEco 提供，通常不会出现在 /proc/net/unix 的 devtools_remote 里
     */
    probeManualForwards
};
