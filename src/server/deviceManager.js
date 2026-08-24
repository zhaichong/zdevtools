const http = require('http');
const adbDriver = require('./drivers/adbDriver.js');
const hdcDriver = require('./drivers/hdcDriver.js');
const { FORWARD_PORT_MIN, FORWARD_PORT_MAX } = require('./constants.js');
const { findFreePort } = require('./portfinder.js');
const TARGET_TIMEOUT_MS = 1000;
const drivers = [adbDriver, hdcDriver];
// 只记录本进程成功创建的映射；绝不清理 Android Studio/DevEco 等外部工具的映射。
const ownedForwards = new Map();

function forwardKey(driverType, deviceId, localPort) {
    return `${driverType}:${deviceId}:${localPort}`;
}

async function removeOwnedForward(driver, record) {
    const forwards = await limitCli(() => driver.listForwards()).catch(() => []);
    const stillOwned = forwards.some(forward =>
        (forward.id === record.deviceId || (driver.type === 'hdc' && forward.id === '*')) &&
        forward.localPort === record.localPort &&
        forward.socket === record.socket
    );
    if (!stillOwned) return false;
    const result = await limitCli(() => driver.removeForward(record.deviceId, record.localPort));
    return Boolean(result?.ok);
}

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
    let searchStartPort = FORWARD_PORT_MIN;
    for (const entry of socketEntries) {
        const key = `${entry.deviceId}:${entry.socket}`;
        if (portMap.has(key)) continue;
        
        let freePort = await findFreePort(searchStartPort);
        while (usedPorts.has(freePort) || [...portMap.values()].some(v => v.port === freePort)) {
            searchStartPort = freePort + 1;
            freePort = await findFreePort(searchStartPort);
        }
        
        if (freePort > FORWARD_PORT_MAX) {
            return { ok: false, portMap, error: `No available local port in ${FORWARD_PORT_MIN}-${FORWARD_PORT_MAX}` };
        }
        
        usedPorts.add(freePort);
        portMap.set(key, { port: freePort, reused: false });
        searchStartPort = freePort + 1;
    }
    return { ok: true, portMap };
}

async function processDevice(driver, baseDevice, portMap, preDiscoveredSockets) {
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

    // 复用 Phase 2 已发现的 sockets，避免重复执行 cat /proc/net/unix
    const sockets = preDiscoveredSockets || [];
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
            if (forwardOk) {
                ownedForwards.set(forwardKey(driver.type, device.id, portInfo.port), {
                    deviceId: device.id, localPort: portInfo.port, socket
                });
            }
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
                .filter(target => Boolean(target && target.id && (['page', 'webview', 'other'].includes(target.type) || target.webSocketDebuggerUrl)))
                .map(target => ({
                    id: target.id,
                    type: target.type || 'page',
                    title: target.title || target.url || `WebView (${target.id.slice(0, 8)})`,
                    url: target.url || '',
                    description: target.description || '',
                    faviconUrl: target.faviconUrl || '',
                    devtoolsFrontendUrl: target.devtoolsFrontendUrl || '',
                    webSocketDebuggerUrl: target.webSocketDebuggerUrl || '',
                    localPort: portInfo.port,
                    deviceId: device.id,
                    processName: socket
                }));
        }
        return processInfo;
    }));

    device.processes = processResults;
    return device;
}

// 发现互斥锁：按 driverType 分别加锁，不同驱动不互相阻塞
const discoveryLock = new Map();

async function getDeviceTargets(driverType = 'all') {
    if (driverType === 'all') {
        const [adbResult, hdcResult] = await Promise.all([
            getDeviceTargets('adb'),
            getDeviceTargets('hdc')
        ]);
        const diagnostics = {
            adbAvailable: adbResult.diagnostics.adbAvailable,
            hdcAvailable: hdcResult.diagnostics.hdcAvailable,
            messages: [...(adbResult.diagnostics.messages || []), ...(hdcResult.diagnostics.messages || [])]
        };
        const devices = [...(adbResult.devices || []), ...(hdcResult.devices || [])];
        return { status: 'success', diagnostics, devices };
    }

    if (discoveryLock.has(driverType)) {
        console.log(`[DeviceManager] Discovery for ${driverType} already in progress, reusing result...`);
        return discoveryLock.get(driverType);
    }
    const promise = _doGetDeviceTargets(driverType).finally(() => {
        discoveryLock.delete(driverType);
    });
    discoveryLock.set(driverType, promise);
    return promise;
}

async function _doGetDeviceTargets(driverType = 'adb') {
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

        // 仅清理本进程创建、且所属设备已掉线的映射。
        if (driverResult.driver.removeForward) {
            const activeDeviceIds = new Set(onlineDevices.map(d => d.id));
            for (const [key, record] of ownedForwards) {
                if (!key.startsWith(`${driverResult.driver.type}:`) || activeDeviceIds.has(record.deviceId)) continue;
                removeOwnedForward(driverResult.driver, record).catch(e => {
                    console.error(`Failed to clean up owned stale forward for ${record.deviceId}`, e);
                }).finally(() => ownedForwards.delete(key));
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
    let portMap, portError;
    try {
        const result = await preAllocatePorts(allSocketEntries, allExistingForwards);
        portMap = result.portMap;
        portError = result.error;
    } catch (e) {
        portMap = new Map();
        portError = e.message;
    }
    if (portError) {
        diagnostics.messages.push({ level: 'warn', message: `Port allocation warning: ${portError}` });
    }

    // Phase 4: 并行处理所有设备（复用 Phase 2 已发现的 sockets，避免重复 CLI 调用）
    const devices = await Promise.all(
        allParsedDevices.map(baseDevice => {
            const driver = baseDevice._driver;
            const deviceClean = { ...baseDevice };
            delete deviceClean._driver;
            deviceClean.driver = driver.type;
            const discovered = socketDiscoveries.find(d => d.deviceId === baseDevice.id);
            return processDevice(driver, deviceClean, portMap, discovered?.sockets || []);
        })
    );

    // 探测 / 主动建立 HDC TCP 调试映射（鸿蒙 NWeb 常见为 tcp:9222，而非 abstract socket）
    if (driverResult && driverResult.driver.type === 'hdc' && devices.length > 0 && driverResult.driver.probeManualForwards) {
        const usedPorts = new Set();
        for (const d of devices) {
            for (const p of d.processes || []) {
                if (p.localPort) usedPorts.add(p.localPort);
            }
        }
        for (const fw of allExistingForwards || []) {
            if (fw.localPort) usedPorts.add(fw.localPort);
        }
        const claimedManualPorts = new Set();

        for (const device of devices) {
            try {
                const manualProcesses = await driverResult.driver.probeManualForwards(device.id, {
                    usedPorts,
                    claimedPorts: claimedManualPorts,
                    // 无设备 ID 的 DevEco/手工映射无法在多设备场景安全归属；仅单设备时使用。
                    allowUnownedExisting: devices.length === 1
                });
                    if (manualProcesses.length > 0) {
                        device.processes.unshift(...manualProcesses);
                        for (const p of manualProcesses) {
                            if (p.localPort) usedPorts.add(p.localPort);
                            if (p.ownedForward) {
                                ownedForwards.set(forwardKey('hdc', device.id, p.ownedForward.localPort), {
                                    deviceId: device.id,
                                    localPort: p.ownedForward.localPort,
                                    socket: p.ownedForward.socket
                                });
                            }
                        }
                    // abstract 路径未找到 socket 时会写入该提示；TCP 映射成功后应移除，避免误导
                    if (device.processes.some(p => p.targets?.length > 0)) {
                        device.diagnostics = (device.diagnostics || []).filter(
                            msg => !/No debuggable WebView target found/i.test(msg)
                        );
                    }
                }
            } catch (e) {
                device.diagnostics = device.diagnostics || [];
                device.diagnostics.push(`HDC TCP probe failed: ${e.message || e}`);
            }
        }
    }

    // 优先返回带可调试 target 的设备；若全部无 target 则仍返回在线设备，避免 UI 误报「未检测到设备」
    const withTargets = devices.filter(d =>
        d.processes && d.processes.some(p => p.targets && p.targets.length > 0)
    );
    const resultDevices = withTargets.length > 0 ? withTargets : devices;

    if (withTargets.length === 0 && devices.length > 0) {
        diagnostics.messages.push({
            level: 'warn',
            message: '已检测到设备，但未发现可调试 WebView。鸿蒙请确认目标页在前台，并已开启 Web 调试（TCP 9222 或 DevEco 映射）。'
        });
    }

    console.log(`[DeviceManager] getDeviceTargets completed in ${Date.now() - startTime}ms for ${resultDevices.length} device(s) (${withTargets.length} with targets)`);

    return { status: 'success', diagnostics, devices: resultDevices };
}

async function startLogStream(deviceId, webContents, driverType) {
    if (!deviceId || !drivers.some(driver => driver.type === driverType)) {
        return { status: 'error', message: 'A valid deviceId and driverType are required' };
    }
    
    let targetDriver = null;
    
    // 如果前端传了 driverType，O(1) 路由
    if (driverType) {
        targetDriver = drivers.find(d => d.type === driverType);
    } 
    
    if (!targetDriver) {
        return { status: 'error', message: `Device ${deviceId} not found or no driver available` };
    }

    return targetDriver.startLogStream(deviceId, webContents);
}

function stopLogStream(deviceId, webContents, driverType) {
    const driver = drivers.find(item => item.type === driverType);
    if (driver && driver.stopLogStream) {
        driver.stopLogStream(deviceId, webContents);
    }
}



async function teardown() {
    for (const driver of drivers) {
        // 先杀死所有日志子进程，防止退出后成为孤儿进程
        if (driver.killAllLogStreams) {
            try { driver.killAllLogStreams(); } catch (e) {
                console.error(`[teardown] ${driver.type} killAllLogStreams error:`, e.message || e);
            }
        }
    }
    for (const [key, record] of ownedForwards) {
        const driver = drivers.find(item => item.type === key.split(':', 1)[0]);
        if (driver?.removeForward) {
            await removeOwnedForward(driver, record).catch(e => {
                console.error(`[teardown] ${driver.type} remove owned forward error:`, e.message || e);
            });
        }
    }
    ownedForwards.clear();
}

module.exports = {
    getDeviceTargets, startLogStream, stopLogStream, teardown
};
