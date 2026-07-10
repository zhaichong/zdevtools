const net = require('net');

/**
 * 查找从 startPort 开始的第一个可用端口
 * @param {number} startPort - 起始端口
 * @param {number} [maxPort] - 最大端口，默认 startPort + 500
 * @returns {Promise<number>}
 */
async function findFreePort(startPort, maxPort = startPort + 500) {
    let currentPort = startPort;

    while (currentPort <= maxPort) {
        try {
            return await new Promise((resolve, reject) => {
                const server = net.createServer();
                server.unref();
                server.on('error', reject);
                server.listen(currentPort, '127.0.0.1', () => {
                    const port = server.address().port;
                    server.close(() => resolve(port));
                });
            });
        } catch (e) {
            currentPort++;
        }
    }
    throw new Error('No free ports available in range');
}

module.exports = { findFreePort };
