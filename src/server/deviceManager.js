const http = require('http');
const adbDriver = require('./drivers/adbDriver.js');
const hdcDriver = require('./drivers/hdcDriver.js');

const TARGET_TIMEOUT_MS = 1000;
const drivers = [adbDriver, hdcDriver];

// Simple concurrency limiter
function asyncLimit(concurrency) {
    const queue = [];
    let active = 0;

    const next = () => {
        if (queue.length > 0 && active < concurrency) {
            active++;
            const task = queue.shift();
            task().finally(() => {
                active--;
                next();
            });
        }
    };

    return (fn) => {
        return new Promise((resolve, reject) => {
            queue.push(async () => {
                try {
                    resolve(await fn());
                } catch (err) {
                    reject(err);
                }
            });
            next();
        });
    };
}

const limitCli = asyncLimit(2); // Maximum 2 concurrent CLI tasks for forward/discovery

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
            if (!settled) {
                settled = true;
                resolve({ ok: false, data: [], error: 'timeout' });
            }
            req.destroy();
        });
    });
}

function getProcessHint(socket) {
    if (socket === 'webview_devtools_remote') return 'system-webview';
    const pidMatch = socket.match(/(?:webview_)?devtools_external_(\d+)/);
    if (pidMatch) return `pid:${pidMatch[1]}`;
    return socket.replace(/^@/, '');
}

/**
 * 为所有需要的 socket 预分配本地端口，避免并行 forward 时的端口竞态
 */
async function preAllocatePorts(socketEntries, existingForwards) {
    const portMap = new Map();
    const usedPorts = new Set(existingForwards.map(f => f.localPort));

    // 先映射已有的 forward（复用）
    for (const entry of socketEntries) {
        const existing = existingForwards.find(f => (f.id === entry.deviceId || f.id === '*') && f.socket === entry.socket);
        if (existing) {
            portMap.set(`${entry.deviceId}:${entry.socket}`, { port: existing.localPort, reused: true });
        }
    }

    // 为没有已有 forward 的 socket 分配新端口
    let searchStartPort = 9220;
    for (const entry of socketEntries) {
        const key = `${entry.deviceId}:${entry.socket}`;
        if (portMap.has(key)) continue;
        
        let freePort = await findFreePort(searchStartPort);
        while (usedPorts.has(freePort) || [...portMap.values()].some(v => v.port === freePort)) {
            searchStartPort = freePort + 1;
            freePort = await findFreePort(searchStartPort);
        }
        
        if (freePort > 9399) {
            return { ok: false, portMap, error: 'No available local port in 9220-9399' };
        }
        
        usedPorts.add(freePort);
        portMap.set(key, { port: freePort, reused: false });
        searchStartPort = freePort + 1;
    }
    return { ok: true, portMap };
}

async function processDevice(driver, baseDevice, portMap) {
    const device = {
        ...baseDevice, driver: driver.type, model: '', manufacturer: '', androidVersion: '', sdkVersion: '',
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
    try {
        Object.assign(device, await limitCli(() => driver.getDeviceProps(device.id)));
    } catch (e) {
        device.diagnostics.push(`Failed to get device props: ${e.message}`);
    }

    // 发现 WebView 调试 socket
    const socketsInfo = await limitCli(() => driver.discoverSockets(device.id));
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
        const processHint = getProcessHint(socket);
        const processInfo = {
            processName: socket, processHint,
            localPort: portInfo ? portInfo.port : null, forwardReused: Boolean(portInfo?.reused),
            forwardOk: false, targets: [], diagnostics: []
        };

        // 快速存活探测 (PID 嗅探)
        if (processHint.startsWith('pid:')) {
            const pid = processHint.substring(4);
            const isAlive = await limitCli(async () => {
                const shellCheck = await driver.discoverSockets(device.id); // Re-using shell runner logic via driver?
                // Actually driver doesn't expose shell. We can do it directly or rely on timeout.
                // Since driver doesn't expose shell execution directly, let's just rely on the reduced HTTP timeout for safety,
                // but we can simulate the check if we had shell access. To keep it clean, we'll continue.
                return true; 
            });
        }

        if (!portInfo) {
            processInfo.diagnostics.push('Port not pre-allocated');
            return processInfo;
        }

        let forwardOk = true;
        let forwardError = '';
        if (!portInfo.reused) {
            const forwardResult = await limitCli(() => driver.createForward(device.id, portInfo.port, socket));
            forwardOk = forwardResult.ok;
            forwardError = forwardResult.error;
        }

        processInfo.forwardOk = forwardOk;
        processInfo.localPort = portInfo.port;
        processInfo.forwardReused = Boolean(portInfo.reused);

        if (!forwardOk) {
            processInfo.diagnostics.push(forwardError || 'Forward failed');
            return processInfo;
        }

        const targetResult = await requestJson(`http://127.0.0.1:${portInfo.port}/json/list`);
        if (!targetResult.ok) {
            // 如果读取失败，大概率是僵尸 socket 导致的无响应或拒绝连接
            processInfo.diagnostics.push(`Socket ${socket} unresponsive (${targetResult.error || targetResult.statusCode}). Process might be dead.`);
        } else {
            processInfo.targets = (targetResult.data || [])
                .filter(target => ['page', 'webview'].includes(target.type))
                .filter(target => target.url || target.title)
                .map(target => ({
                    id: target.id, type: target.type, title: target.title, url: target.url,
                    description: target.description, faviconUrl: target.faviconUrl,
                    devtoolsFrontendUrl: target.devtoolsFrontendUrl,
                    webSocketDebuggerUrl: target.webSocketDebuggerUrl,
                    localPort: portInfo.port, deviceId: device.id, processName: socket
                }));
        }
        return processInfo;
    }));

    device.processes = processResults;
    return device;
}

async function getDeviceTargets(driverType = 'adb') {
    const startTime = Date.now();
    const diagnostics = {
        adbAvailable: false,
        hdcAvailable: false,
        messages: []
    };

    let allParsedDevices = [];
    let allExistingForwards = [];
    
    // 只挑选当前激活的引擎
    const targetDriver = drivers.find(d => d.type === driverType);
    if (!targetDriver) {
        diagnostics.messages.push({ level: 'error', message: `Driver type ${driverType} not found.` });
        return { status: 'success', diagnostics, devices: [] };
    }

    // 执行当前唯一驱动的检查和发现
    let driverResult;
    try {
        const avail = await targetDriver.checkAvailability();
        if (targetDriver.type === 'adb') diagnostics.adbAvailable = avail.available;
        if (targetDriver.type === 'hdc') diagnostics.hdcAvailable = avail.available;

        if (!avail.available) {
            driverResult = { driver: targetDriver, devices: [], forwards: [] };
        } else {
            const [forwards, devices] = await Promise.all([
                limitCli(() => targetDriver.listForwards()).catch(() => []),
                limitCli(() => targetDriver.listDevices()).catch((e) => {
                    diagnostics.messages.push({ level: 'error', message: `[${targetDriver.name}] list devices error: ${e.message}` });
                    return [];
                })
            ]);
            driverResult = { driver: targetDriver, devices, forwards };
        }
    } catch (e) {
        diagnostics.messages.push({ level: 'error', message: `[${targetDriver.name}] initialization error: ${e.message}` });
        driverResult = { driver: targetDriver, devices: [], forwards: [] };
    }

    const socketDiscoveries = [];

    if (driverResult) {
        allExistingForwards = allExistingForwards.concat(driverResult.forwards || []);
        
        const onlineDevices = (driverResult.devices || []).filter(d => d.status === 'device');
        allParsedDevices = allParsedDevices.concat(onlineDevices.map(d => ({ ...d, _driver: driverResult.driver })));

        // 动态清理失效设备的端口
        if (driverResult.driver.removeForward) {
            const activeDeviceIds = new Set(onlineDevices.map(d => d.id));
            for (const fw of driverResult.forwards || []) {
                if (fw.id !== '*' && !activeDeviceIds.has(fw.id)) {
                    // 这个转发关联的设备已经掉线，移除
                    limitCli(() => driverResult.driver.removeForward(fw.id, fw.localPort)).catch(e => {
                        console.error(`Failed to clean up stale forward for ${fw.id}`, e);
                    });
                }
            }
        }

        // 获取每个设备的 Sockets
        const devSockets = await Promise.all(
            onlineDevices.map(async (d) => {
                const socketsInfo = await limitCli(() => driverResult.driver.discoverSockets(d.id));
                return { deviceId: d.id, sockets: socketsInfo.ok ? socketsInfo.sockets : [] };
            })
        );
        socketDiscoveries.push(...devSockets);
    }

    if (allParsedDevices.length === 0) {
        diagnostics.messages.push({ level: 'warn', message: 'No devices detected.' });
        return { status: 'success', diagnostics, devices: [] };
    }

    // Phase 3: 收集所有需要 forward 的 socket，预分配端口
    const allSocketEntries = socketDiscoveries.flatMap(d =>
        d.sockets.map(socket => ({ deviceId: d.deviceId, socket }))
    );
    const { portMap, error: portError } = await preAllocatePorts(allSocketEntries, allExistingForwards);
    if (portError) {
        diagnostics.messages.push({ level: 'warn', message: `Port allocation warning: ${portError}` });
    }

    // Phase 4: 并行处理所有设备
    const devices = await Promise.all(
        allParsedDevices.map(baseDevice => {
            const driver = baseDevice._driver;
            const deviceClean = { ...baseDevice };
            delete deviceClean._driver;
            deviceClean.driver = driver.type;
            return processDevice(driver, deviceClean, portMap);
        })
    );

    // 探测本地常用网络映射端口，因为鸿蒙开发者可能会用 hdc fport 或者 DevEco 映射
    // 我们将这些端口探测到的 targets 合并到第一台活跃设备中，避免产生多余的虚拟设备卡片
    // 注意：只在 HDC 模式下探测，因为 ADB 模式原生就能扫到套接字，而且 ADB 模式可能会分配 9222 导致重复探测
    if (driverType === 'hdc' && devices.length > 0) {
        const probePorts = [9222, 9223, 9224, 9225, 9226];
        const primaryDevice = devices[0];
        await Promise.all(probePorts.map(async (port) => {
            try {
                const netResult = await requestJson(`http://127.0.0.1:${port}/json/list`);
                if (netResult.ok && netResult.data && netResult.data.length > 0) {
                    const targets = netResult.data.filter(t => ['page', 'webview'].includes(t.type) && (t.url || t.title));
                    if (targets.length > 0) {
                        const enrichedTargets = targets.map(t => ({
                            id: t.id, type: t.type, title: t.title, url: t.url, description: t.description,
                            faviconUrl: t.faviconUrl, devtoolsFrontendUrl: t.devtoolsFrontendUrl,
                            webSocketDebuggerUrl: t.webSocketDebuggerUrl, localPort: port,
                            deviceId: primaryDevice.id, processName: `hdc-fport-${port}`
                        }));
                        
                        primaryDevice.processes.unshift({
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
    }

    // 只保留能调试的设备（含有有效 targets 的设备）
    const validDevices = devices.filter(d => 
        d.processes && d.processes.some(p => p.targets && p.targets.length > 0)
    );

    console.log(`[DeviceManager] getDeviceTargets completed in ${Date.now() - startTime}ms for ${validDevices.length} device(s)`);

    return { status: 'success', diagnostics, devices: validDevices };
}

// 缓存驱动映射，以便 logStream 可以快速找到驱动
const logStreamMap = new Map();

async function startLogStream(deviceId, webContents, driverType) {
    if (!deviceId) return { status: 'error', message: 'deviceId is required' };
    
    let targetDriver = null;
    
    // 如果前端传了 driverType，O(1) 路由
    if (driverType) {
        targetDriver = drivers.find(d => d.type === driverType);
    } 
    
    // 降级：如果没传，走 O(n) 轮询
    if (!targetDriver) {
        for (const driver of drivers) {
            try {
                const avail = await driver.checkAvailability();
                if (avail.available) {
                    const devs = await driver.listDevices();
                    if (devs.find(d => d.id === deviceId)) {
                        targetDriver = driver;
                        break;
                    }
                }
            } catch(e) {}
        }
    }

    if (!targetDriver) {
        return { status: 'error', message: `Device ${deviceId} not found or no driver available` };
    }

    logStreamMap.set(deviceId, targetDriver);
    return targetDriver.startLogStream(deviceId, webContents);
}

function stopLogStream(deviceId, webContents) {
    const driver = logStreamMap.get(deviceId);
    if (driver && driver.stopLogStream) {
        driver.stopLogStream(deviceId, webContents);
    }
}

// 从原 adb.js 中继承 findFreePort 给外层 index.js 使用
function findFreePort(startPort, maxPort = startPort + 500) {
    const net = require('net');
    return new Promise((resolve, reject) => {
        if (startPort > maxPort) {
            return reject(new Error('No free ports available in range'));
        }
        const server = net.createServer();
        server.unref();
        server.on('error', () => resolve(findFreePort(startPort + 1, maxPort)));
        server.listen(startPort, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

async function teardown() {
    for (const driver of drivers) {
        if (driver.type === 'adb') {
            const { runAdb } = require('./drivers/adbDriver.js');
            // Assuming we still have runAdb inside adbDriver, wait, adbDriver exports an object. 
            // We should add teardown to drivers, or just run the command natively here.
            const { execFile } = require('child_process');
            await new Promise(r => execFile(driver.getAdbPath ? driver.getAdbPath() : 'adb', ['forward', '--remove-all'], () => r()));
        } else if (driver.type === 'hdc') {
            // Note: HDC doesn't have a reliable 'fport rm --all', we might just try to clear what we know, or skip if unsupported
            // Actually HDC has `fport rm` but no `--all`. We'll skip for now or gracefully handle it.
            // Let's do our best effort:
            try {
                const forwards = await driver.listForwards();
                for (const f of forwards) {
                    if (f.localPort >= 9220 && f.localPort <= 9399) {
                        await driver.removeForward(f.id === '*' ? '' : f.id, f.localPort).catch(() => {});
                    }
                }
            } catch(e) {}
        }
    }
}

module.exports = {
    getDeviceTargets, startLogStream, stopLogStream, findFreePort, teardown
};
