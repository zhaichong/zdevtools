const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ADB / 设备相关
    getTargets: (driverType) => ipcRenderer.invoke('get-targets', driverType),
    startLogcat: (deviceId, driverType) => ipcRenderer.invoke('start-logcat', deviceId, driverType),
    stopLogcat: (deviceId) => ipcRenderer.invoke('stop-logcat', deviceId),
    onLogcatChunk: (callback) => {
        const handler = (_event, chunk) => callback(chunk);
        ipcRenderer.on('logcat-chunk', handler);
        return () => ipcRenderer.removeListener('logcat-chunk', handler);
    },
    onLogcatError: (callback) => {
        const handler = (_event, error) => callback(error);
        ipcRenderer.on('logcat-error', handler);
        return () => ipcRenderer.removeListener('logcat-error', handler);
    },
    saveRrwebChunk: (targetId, chunk) => ipcRenderer.invoke('save-rrweb-chunk', targetId, chunk),
    clearRrwebChunks: (targetId) => ipcRenderer.invoke('clear-rrweb-chunks', targetId),
    loadRrwebChunks: (targetId) => ipcRenderer.invoke('load-rrweb-chunks', targetId),
    createDiagnosticRun: (meta) => ipcRenderer.invoke('diagnostic:createRun', meta),
    appendDiagnosticEvidence: (runId, payload) => ipcRenderer.invoke('diagnostic:appendEvidence', runId, payload),
    getDiagnosticRun: (runId) => ipcRenderer.invoke('diagnostic:getRun', runId),
    exportDiagnosticRun: (runId) => ipcRenderer.invoke('diagnostic:exportRun', runId),

    // 在线更新相关
    checkForUpdates: () => ipcRenderer.invoke('check-for-update'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getUpdateState: () => ipcRenderer.invoke('get-update-state'),

    // 更新状态事件订阅（返回取消订阅函数）
    onUpdateStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('update:status', handler);
        return () => ipcRenderer.removeListener('update:status', handler);
    }
});
