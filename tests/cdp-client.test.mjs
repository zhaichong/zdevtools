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
    assert.match(wsInstance.url, /\/ws-proxy\/9222\/devtools\/page\/test-target-1\?/);
    assert.doesNotMatch(wsInstance.url, /\/devtools\/browser/);
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

// Test 5: listed target websocket URL (HarmonyOS numeric id) is the attach path
{
    const client = useCdpClient(9222, '2', {
        proxyToken: 'test-capability',
        wsDebuggerPath: 'ws://127.0.0.1:9222/devtools/page/2'
    });
    client.connect().catch(() => {});
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    assert.match(ws.url, /\/ws-proxy\/9222\/devtools\/page\/2\?ztools_token=test-capability/);
    assert.doesNotMatch(ws.url, /\/ws:\/\//);
    assert.doesNotMatch(ws.url, /127\.0\.0\.1:9222/);
    assert.doesNotMatch(ws.url, /\/devtools\/browser/);
    client.close();
}

// Test 6: a browser-level debugger path must not be forwarded; fall back to /devtools/page/<id>
{
    const client = useCdpClient(9222, 'page-1', {
        proxyToken: 'test-capability',
        wsDebuggerPath: '/devtools/browser/abc-123'
    });
    client.connect().catch(() => {});
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    assert.match(ws.url, /\/devtools\/page\/page-1\?/);
    assert.doesNotMatch(ws.url, /\/devtools\/browser/);
    client.close();
}

// Encoded traversal in the listed websocket URL must not become the attach path
{
    const client = useCdpClient(9222, 'page-2', {
        proxyToken: 'test-capability',
        wsDebuggerPath: '/devtools/page/%2e%2e%2fbrowser'
    });
    client.connect().catch(() => {});
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    assert.match(ws.url, /\/devtools\/page\/page-2\?/);
    assert.doesNotMatch(ws.url, /%2e|browser/i);
    client.close();
}

// Test 7: close() waits for the socket to finish closing, and a later 1006 must not reconnect
{
    const client = useCdpClient(9222, 'close-wait-target', { proxyToken: 'test-capability' });
    const pending = client.connect();
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    ws.readyState = MockWebSocket.OPEN;
    ws.onopen();
    await pending;
    const socketsAfterOpen = MockWebSocket.instances.length;

    await client.close();
    assert.strictEqual(client.connected.value, false);
    assert.strictEqual(ws.readyState, MockWebSocket.CLOSED);

    ws.onclose({ code: 1006, reason: 'kicked' });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.strictEqual(
        MockWebSocket.instances.length,
        socketsAfterOpen,
        'close() must suppress reconnect after an abnormal follow-up onclose'
    );
}

console.log('cdp-client lifecycle tests passed');
