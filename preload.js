const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ADB / 设备相关
    getTargets: () => ipcRenderer.invoke('get-targets'),
    getLogcat: (deviceId, since) => ipcRenderer.invoke('get-logcat', deviceId, since),
    restartAdb: () => ipcRenderer.invoke('restart-adb'),
    saveRrwebChunk: (targetId, chunk) => ipcRenderer.invoke('save-rrweb-chunk', targetId, chunk),
    loadRrwebChunks: (targetId) => ipcRenderer.invoke('load-rrweb-chunks', targetId),

    // 在线更新相关
    checkForUpdates: () => ipcRenderer.invoke('check-for-update'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // 更新状态事件订阅（返回取消订阅函数）
    onUpdateStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('update:status', handler);
        return () => ipcRenderer.removeListener('update:status', handler);
    }
});
