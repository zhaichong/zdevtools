import { ref, onMounted, onBeforeUnmount } from 'vue';
import { nowTime } from '@/shared/utils/format.js';

/**
 * Dashboard 设备数据获取 + 轮询
 */
export function useDevices() {
    const data = ref(null);
    const status = ref({ text: '初始化中', type: 'busy' });
    const diagnostics = ref([]);
    const devicesTotal = ref(0);
    const targetsTotal = ref(0);
    const lastScanTime = ref('-');
    let pollingTimer = null;

    function setStatus(text, type = '') {
        status.value = { text, type };
    }

    async function fetchTargets({ silent = false } = {}) {
        if (!silent) setStatus('扫描中', 'busy');
        try {
            const result = await window.electronAPI.getTargets();
            data.value = result;
            processData(result);
            setStatus('运行正常', '');
        } catch (error) {
            setStatus('服务连接失败', 'error');
            diagnostics.value = [{ message: `连接本地服务失败：${error.message}`, isError: true }];
        }
    }

    function processData(d) {
        const diags = [];
        for (const item of d.diagnostics?.messages || []) {
            diags.push({ message: item.message, isError: item.level === 'error' });
        }

        let devices = 0;
        let targets = 0;

        if (d.devices?.length) {
            devices = d.devices.length;
            for (const device of d.devices) {
                if (device.status === 'unauthorized') {
                    diags.push({ message: `设备 ${device.id} 未授权。请解锁设备并允许 USB 调试。`, isError: true });
                } else if (device.status === 'offline') {
                    diags.push({ message: `设备 ${device.id} 离线。请重新插拔 USB 或重启 USB 调试。`, isError: true });
                }
                for (const proc of device.processes || []) {
                    for (const target of proc.targets || []) {
                        if (target.type === 'page' || target.type === 'webview') {
                            targets += 1;
                        }
                    }
                    if (proc.diagnostics?.length) {
                        diags.push({ message: `${proc.processName}: ${proc.diagnostics.join('; ')}`, isError: true });
                    }
                }
            }
        }

        if (!d.devices?.length) {
            diags.push({ message: '未检测到设备。请确认 USB 已连接、已开启 USB 调试，并允许电脑调试。', isError: false });
        }

        diagnostics.value = diags;
        devicesTotal.value = devices;
        targetsTotal.value = targets;
        lastScanTime.value = nowTime();
    }

    async function restartAdb() {
        setStatus('重启 ADB 中', 'busy');
        try {
            await window.electronAPI.restartAdb();
            await fetchTargets();
        } catch (e) {
            setStatus('ADB 重启失败', 'error');
        }
    }

    function startPolling() {
        pollingTimer = setInterval(() => fetchTargets({ silent: true }), 7000);
    }

    function stopPolling() {
        if (pollingTimer) clearInterval(pollingTimer);
    }

    onMounted(() => {
        fetchTargets();
        startPolling();
    });

    onBeforeUnmount(() => {
        stopPolling();
    });

    return {
        data, status, diagnostics, devicesTotal, targetsTotal, lastScanTime,
        fetchTargets, restartAdb
    };
}
