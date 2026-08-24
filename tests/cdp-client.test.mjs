import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const assert = require('assert');
const { useCdpClient } = require('../src/shared/composables/useCdpClient.js');

// 模拟简易 WebSocket 环境供纯 Node 单元测试验证状态机
class MockWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;
        this.onopen = null;
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
        MockWebSocket.instances.push(this);
    }

    send(data) {
        if (this.readyState !== MockWebSocket.OPEN) throw new Error('Not open');
        MockWebSocket.sentMessages.push(JSON.parse(data));
    }

    close(code = 1000, reason = '') {
        this.readyState = MockWebSocket.CLOSED;
        if (this.onclose) this.onclose({ code, reason });
    }
}
MockWebSocket.instances = [];
MockWebSocket.sentMessages = [];

globalThis.WebSocket = MockWebSocket;
globalThis.location = { protocol: 'http:', host: '127.0.0.1:8999' };

// Test 1: close() 必须 reject 所有 pending 请求，不能让 Promise 永远挂起
{
    const client = useCdpClient(9222, 'test-target-1', { proxyToken: 'test-capability' });
    const connectPromise = client.connect();
    const wsInstance = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    wsInstance.readyState = MockWebSocket.OPEN;
    wsInstance.onopen();

    let evaluatedResolved = false;
    let evaluateRejectedError = null;

    const evalPromise = client.evaluate('window.foo = 1').then(
        () => { evaluatedResolved = true; },
        (err) => { evaluateRejectedError = err; }
    );

    // 在评估仍在等待时主动关闭客户端（模拟切 DevTools 面板）
    client.close();

    await evalPromise;
    assert.strictEqual(evaluatedResolved, false, 'Pending evaluate must not resolve');
    assert.ok(evaluateRejectedError, 'Pending evaluate must be rejected');
    assert.strictEqual(evaluateRejectedError.message, 'CDP connection closed');
    assert.strictEqual(client.connected.value, false);
}

// Test 2: close() 时若 connect() 处于未完成状态，connectPromise 也必须安全 reject
{
    const client = useCdpClient(9222, 'test-target-2', { proxyToken: 'test-capability' });
    let connectRejected = false;
    const connectPromise = client.connect().catch(() => {
        connectRejected = true;
    });

    client.close();
    await connectPromise;
    assert.strictEqual(connectRejected, true, 'Pending connect() must be rejected on close()');
}

// Test 3: 旧连接被关闭后，其 onclose 不会影响新创建的连接
{
    const client = useCdpClient(9222, 'test-target-3', { proxyToken: 'test-capability' });

    // 第 1 代连接
    client.connect().catch(() => {});
    const firstWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    assert.match(firstWs.url, /ztools_token=test-capability/);

    // 切换面板重新建立第 2 代连接
    client.close();
    client.connect();
    const secondWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    secondWs.readyState = MockWebSocket.OPEN;
    secondWs.onopen();

    assert.strictEqual(client.connected.value, true);

    // 旧连接触发延迟的 onclose
    firstWs.onclose({ code: 1006, reason: 'Abnormal' });

    // 验证当前新连接依然有效，未被旧连接的 onclose 误杀
    assert.strictEqual(client.connected.value, true, 'New connection must remain active despite old socket onclose');
    client.close();
}

// Test 4: a connection attempt that times out must retry even when WebSocket
// reports the default close code 1000.
{
    const before = MockWebSocket.instances.length;
    const client = useCdpClient(9222, 'timeout-target', {
        proxyToken: 'test-capability',
        connectTimeout: 1
    });
    const pending = client.connect().catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.ok(MockWebSocket.instances.length >= before + 2, 'Timed-out connection must create a retry attempt');
    client.close();
    await pending;
}

console.log('cdp-client lifecycle tests passed');
