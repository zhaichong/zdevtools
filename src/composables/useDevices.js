import { ref, onMounted, onBeforeUnmount } from 'vue';
import { nowTime } from '@/shared/utils/format.js';

/**
 * 设备数据获取 + 轮询
 */
export function useDevices() {
    const data = ref(null);
    const status = ref({ text: '初始化中', type: 'busy' });
    const diagnostics = ref([]);
    const devicesTotal = ref(0);
    const targetsTotal = ref(0);
    const lastScanTime = ref('-');
    let pollingTimer = null;
    let fetchInFlight = false;

    function setStatus(text, type = '') {
        status.value = { text, type };
    }

    async function fetchTargets({ silent = false } = {}) {
        if (fetchInFlight) return;
        fetchInFlight = true;
        if (!silent) setStatus('扫描中', 'busy');
        try {
            const result = await window.electronAPI?.getTargets?.('all');
            if (!result) throw new Error('electronAPI not available');
            data.value = result;
            processData(result);
            setStatus('运行正常', '');
        } catch (error) {
            setStatus('服务连接失败', 'error');
            diagnostics.value = [{ message: `连接本地服务失败：${error.message}`, isError: true }];
        } finally {
            fetchInFlight = false;
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
            diags.push({ message: '未检测到设备。请确认 USB 已连接、已开启调试，并允许电脑调试。', isError: false });
        } else if (!targets) {
            // 后端已可能写入同类提示；这里补一条前端可读说明，避免只靠标题区分
            const hasBackendHint = diags.some(item => /未发现可调试 WebView|No debuggable/i.test(item.message));
            if (!hasBackendHint) {
                diags.push({
                    message: '已检测到设备，但未发现可调试 WebView。请确认目标应用在前台且已开启 WebView/HDC 调试。',
                    isError: false
                });
            }
        }

        diagnostics.value = diags;
        devicesTotal.value = devices;
        targetsTotal.value = targets;
        lastScanTime.value = nowTime();
    }

    function startPolling() {
        if (!pollingTimer) {
            pollingTimer = setInterval(() => fetchTargets({ silent: true }), 7000);
        }
    }

    function stopPolling() {
        if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
        }
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            stopPolling();
        } else {
            fetchTargets({ silent: true });
            startPolling();
        }
    }

    onMounted(() => {
        fetchTargets();
        startPolling();
        document.addEventListener('visibilitychange', handleVisibilityChange);
    });

    onBeforeUnmount(() => {
        stopPolling();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    });

    return {
        data,
        status,
        diagnostics,
        devicesTotal,
        targetsTotal,
        lastScanTime,
        fetchTargets
    };
}
