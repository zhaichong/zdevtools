import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const assert = require('assert');
const { parseForwards } = require('../src/server/drivers/adbDriver.js');
const { parseDevtoolsSockets } = require('../src/server/drivers/baseDriver.js');

// adb forward --list: Chrome inspect unix-abstract socket
{
    const items = parseForwards('emulator-5554 tcp:9222 localabstract:chrome_devtools_remote');
    assert.equal(items.length, 1);
    assert.deepStrictEqual(items[0], {
        id: 'emulator-5554',
        localPort: 9222,
        socket: 'chrome_devtools_remote',
        kind: 'abstract'
    });
}

// WebView per-process socket + tcp-to-tcp leftover
{
    const items = parseForwards([
        'R58M30ABCDE tcp:9223 localabstract:webview_devtools_remote_3458',
        'R58M30ABCDE tcp:9224 tcp:9222',
        '',
        'List of devices attached'
    ].join('\n'));
    assert.equal(items.length, 2);
    assert.equal(items[0].kind, 'abstract');
    assert.equal(items[0].socket, 'webview_devtools_remote_3458');
    assert.equal(items[1].kind, 'tcp');
    assert.equal(items[1].localPort, 9224);
    assert.equal(items[1].remotePort, 9222);
    assert.equal(items[1].socket, 'tcp:9222');
}

assert.deepStrictEqual(parseForwards(''), []);
assert.deepStrictEqual(parseForwards(null), []);

// unix @ prefix copied into adb forward --list must match parseDevtoolsSockets (no @)
{
    const items = parseForwards('127.0.0.1:5555 tcp:9222 localabstract:@chrome_devtools_remote');
    assert.equal(items.length, 1);
    assert.equal(items[0].id, '127.0.0.1:5555');
    assert.equal(items[0].socket, 'chrome_devtools_remote');
}

// Another device's forward is a different serial — parsers keep the owner id.
{
    const items = parseForwards([
        'device-a tcp:9222 localabstract:chrome_devtools_remote',
        'device-b tcp:9223 localabstract:chrome_devtools_remote'
    ].join('\n'));
    assert.equal(items[0].id, 'device-a');
    assert.equal(items[1].id, 'device-b');
    assert.notEqual(items[0].localPort, items[1].localPort);
}

// /proc/net/unix from HarmonyOS + Android Chrome inspect
{
    const unix = [
        '0000000000000000: 00000002 00000000 00010000 0001 01 12345 @webview_devtools_remote_3458',
        '#0: 00000002 0 10000 1 1 2318187 @webview_devtools_remote_43406',
        '0000000000000000: 00000002 00000000 00010000 0001 01 28232 @chrome_devtools_remote',
        '0000000000000000: 00000003 00000000 00000000 0001 03 1 @unrelated_socket'
    ].join('\n');
    const sockets = parseDevtoolsSockets(unix);
    assert.deepStrictEqual(sockets, [
        'webview_devtools_remote_3458',
        'webview_devtools_remote_43406',
        'chrome_devtools_remote'
    ]);
}

console.log('adb-discovery tests passed');
