const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getTargets: () => ipcRenderer.invoke('get-targets'),
    getLogcat: (deviceId) => ipcRenderer.invoke('get-logcat', deviceId),
    restartAdb: () => ipcRenderer.invoke('restart-adb'),
    saveRrwebChunk: (targetId, chunk) => ipcRenderer.invoke('save-rrweb-chunk', targetId, chunk),
    loadRrwebChunks: (targetId) => ipcRenderer.invoke('load-rrweb-chunks', targetId)
});
