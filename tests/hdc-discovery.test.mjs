import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const assert = require('assert');
const { parseForwards, shouldProbeExistingTcpPort } = require('../src/server/drivers/hdcDriver.js');

// abstract + device id
{
    const items = parseForwards('f4012241524a3131581562b11e9ebc00 tcp:9222 localabstract:webview_devtools_remote_1234');
    assert.equal(items.length, 1);
    assert.deepStrictEqual(items[0], {
        id: 'f4012241524a3131581562b11e9ebc00',
        localPort: 9222,
        socket: 'webview_devtools_remote_1234',
        kind: 'abstract'
    });
}

// abstract without device id
{
    const items = parseForwards('tcp:9301 localabstract:devtools_remote');
    assert.equal(items.length, 1);
    assert.equal(items[0].id, '*');
    assert.equal(items[0].kind, 'abstract');
    assert.equal(items[0].localPort, 9301);
    assert.equal(items[0].socket, 'devtools_remote');
}

// tcp → tcp plain
{
    const items = parseForwards('192.168.77.83:8710 tcp:9222 tcp:9222');
    assert.equal(items.length, 1);
    assert.deepStrictEqual(items[0], {
        id: '192.168.77.83:8710',
        localPort: 9222,
        remotePort: 9222,
        socket: 'tcp:9222',
        kind: 'tcp'
    });
}

// tcp → tcp quoted + [Forward] (real hdc 1.3.x output)
{
    const items = parseForwards("'tcp:9222 tcp:9222'\t[Forward]");
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'tcp');
    assert.equal(items[0].localPort, 9222);
    assert.equal(items[0].remotePort, 9222);
    assert.equal(items[0].socket, 'tcp:9222');
    assert.equal(items[0].id, '*');
}

// mixed multi-line
{
    const output = [
        "f401 tcp:9220 localabstract:webview_devtools_remote",
        "'tcp:9222 tcp:9222'\t[Forward]",
        "192.168.1.8:8710 tcp:9230 tcp:9223",
        "",
        "junk line"
    ].join('\n');
    const items = parseForwards(output);
    assert.equal(items.length, 3);
    assert.equal(items[0].kind, 'abstract');
    assert.equal(items[1].kind, 'tcp');
    assert.equal(items[1].localPort, 9222);
    assert.equal(items[2].localPort, 9230);
    assert.equal(items[2].remotePort, 9223);
    assert.equal(items[2].socket, 'tcp:9223');
}

// empty / null safe
assert.deepStrictEqual(parseForwards(''), []);
assert.deepStrictEqual(parseForwards(null), []);

// /proc/net/unix @ prefix copied into hdc fport ls must strip @
{
    const items = parseForwards('tcp:9222 localabstract:@webview_devtools_remote_3458');
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'abstract');
    assert.equal(items[0].socket, 'webview_devtools_remote_3458');
}

// Official HarmonyOS DevTools mapping (hdc fport ls after
// `hdc fport tcp:9222 localabstract:webview_devtools_remote_3458`)
{
    const items = parseForwards([
        'Forwardport list:',
        '[Empty]',
        'tcp:9222 localabstract:webview_devtools_remote_3458',
        "[Forward] 70d2a3e2 tcp:9230 tcp:9222",
        '70d2a3e2 tcp:9223 localabstract:webview_devtools_remote_43406 [Forward]'
    ].join('\n'));
    assert.equal(items.length, 3);
    assert.deepStrictEqual(items[0], {
        id: '*',
        localPort: 9222,
        socket: 'webview_devtools_remote_3458',
        kind: 'abstract'
    });
    assert.equal(items[1].id, '70d2a3e2');
    assert.equal(items[1].kind, 'tcp');
    assert.equal(items[1].localPort, 9230);
    assert.equal(items[1].remotePort, 9222);
    assert.equal(items[2].id, '70d2a3e2');
    assert.equal(items[2].kind, 'abstract');
    assert.equal(items[2].socket, 'webview_devtools_remote_43406');
}

// A TCP forward belongs to its HDC device. Unknown external ports are only
// safe to use in an explicitly single-device context.
{
    const forwards = [
        { id: 'device-a', localPort: 9222, remotePort: 9222, kind: 'tcp' },
        { id: '*', localPort: 9223, remotePort: 9223, kind: 'tcp' }
    ];
    const claimed = new Set([9223]);
    assert.equal(shouldProbeExistingTcpPort('device-a', 9222, forwards, claimed), true);
    assert.equal(shouldProbeExistingTcpPort('device-b', 9222, forwards, claimed), false);
    assert.equal(shouldProbeExistingTcpPort('device-a', 9223, forwards, claimed), false);
    assert.equal(shouldProbeExistingTcpPort('device-b', 9224, forwards, claimed), false);
    assert.equal(shouldProbeExistingTcpPort('device-b', 9224, forwards, claimed, { allowUnowned: true }), true);
}

console.log('hdc-discovery tests passed');
