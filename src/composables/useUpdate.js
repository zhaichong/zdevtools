import { ref, onMounted, onUnmounted } from 'vue';

/**
 * 在线更新状态管理 composable
 *
 * 管理 electron-updater 的生命周期状态，通过 IPC 桥接与主进程通信。
 * 状态流转：idle → checking → available → downloading → downloaded → (重启)
 *                              ↘ not-available
 *                              ↘ error（可恢复）
 */
export function useUpdate() {
    const updateStatus = ref('idle');
    // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'

    const downloadProgress = ref({ percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 });
    const updateInfo = ref(null);       // { version, releaseDate, releaseNotes }
    const errorMessage = ref('');
    const currentVersion = ref('');

    /** @type {Function|null} */
    let unsubscribe = null;

    const api = window.electronAPI;

    /**
     * 手动检查更新
     */
    async function checkForUpdates() {
        if (!api) return;
        updateStatus.value = 'checking';
        errorMessage.value = '';
        try {
            const result = await api.checkForUpdates();
            if (!result.ok) {
                updateStatus.value = 'error';
                errorMessage.value = result.error || '检查更新失败';
            } else {
                // 如果后端已有缓存的状态，主动拉取一次以防漏事件
                const currentState = await api.getUpdateState();
                if (currentState && currentState.type !== 'idle' && currentState.type !== 'checking') {
                    handleStatusEvent(currentState);
                }
            }
        } catch (e) {
            updateStatus.value = 'error';
            errorMessage.value = e.message || '检查更新时发生异常';
        }
    }

    /**
     * 手动下载更新
     */
    async function downloadUpdate() {
        if (!api) return;
        updateStatus.value = 'downloading';
        downloadProgress.value = { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 };
        errorMessage.value = '';
        try {
            const result = await api.downloadUpdate();
            if (!result.ok) {
                updateStatus.value = 'error';
                errorMessage.value = result.error || '下载更新失败';
            }
            // 下载完成的状态变更由 onUpdateStatus 事件驱动
        } catch (e) {
            updateStatus.value = 'error';
            errorMessage.value = e.message || '下载更新时发生异常';
        }
    }

    /**
     * 退出并安装更新
     */
    function quitAndInstall() {
        if (!api) return;
        api.quitAndInstall();
    }

    /**
     * 选择并执行本地安装包升级
     */
    async function installLocalPackage() {
        if (!api) return;
        try {
            const result = await api.installLocalPackage();
            if (!result.ok && result.error !== 'Cancelled') {
                errorMessage.value = result.error || '本地安装失败';
                updateStatus.value = 'error';
            }
        } catch (e) {
            errorMessage.value = e.message || '本地安装发生异常';
            updateStatus.value = 'error';
        }
    }

    /**
     * 监听主进程推送的更新事件
     */
    function handleStatusEvent(data) {
        switch (data.type) {
            case 'checking':
                updateStatus.value = 'checking';
                break;
            case 'available':
                updateStatus.value = 'available';
                updateInfo.value = {
                    version: data.version,
                    releaseDate: data.releaseDate,
                    releaseNotes: data.releaseNotes
                };
                break;
            case 'not-available':
                updateStatus.value = 'not-available';
                break;
            case 'download-progress':
                updateStatus.value = 'downloading';
                downloadProgress.value = {
                    percent: data.percent,
                    bytesPerSecond: data.bytesPerSecond,
                    transferred: data.transferred,
                    total: data.total
                };
                break;
            case 'downloaded':
                updateStatus.value = 'downloaded';
                break;
            case 'error':
                updateStatus.value = 'error';
                errorMessage.value = data.message || '更新过程发生错误';
                break;
        }
    }

    /**
     * 启动时获取当前版本号并监听更新事件
     */
    async function init() {
        if (api) {
            try {
                currentVersion.value = await api.getAppVersion();
            } catch (e) {
                currentVersion.value = '';
            }
            unsubscribe = api.onUpdateStatus(handleStatusEvent);
            
            try {
                const currentState = await api.getUpdateState();
                if (currentState && currentState.type !== 'idle') {
                    handleStatusEvent(currentState);
                }
            } catch (e) {
                // Ignore
            }
        }
    }

    onMounted(() => {
        init();
    });

    onUnmounted(() => {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    });

    return {
        // 状态
        updateStatus,
        downloadProgress,
        updateInfo,
        errorMessage,
        currentVersion,
        // 操作
        checkForUpdates,
        downloadUpdate,
        quitAndInstall,
        installLocalPackage
    };
}
