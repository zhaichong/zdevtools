const { getDeviceTargets, startLogStream, stopLogStream } = require('../../server/deviceManager.js');

/**
 * 注册设备发现和日志流相关的 IPC handler
 * @param {import('electron').IpcMain} ipcMain
 */
function setupDeviceIpc(ipcMain) {
    ipcMain.handle('get-targets', async (event, driverType) => {
        return await getDeviceTargets(driverType);
    });

    ipcMain.handle('start-logcat', async (event, deviceId, driverType) => {
        return await startLogStream(deviceId, event.sender, driverType);
    });

    ipcMain.handle('stop-logcat', async (event, deviceId, driverType) => {
        stopLogStream(deviceId, event.sender, driverType);
        return { status: 'success' };
    });
}

module.exports = { setupDeviceIpc };
