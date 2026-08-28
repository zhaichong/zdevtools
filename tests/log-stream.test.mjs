import { EventEmitter } from 'events';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const assert = require('assert');
const { createLogStreamManager } = require('../src/server/drivers/baseDriver.js');

function mockWebContents() {
    const sends = [];
    const handlers = {};
    const events = [];
    return {
        sends,
        events,
        isDestroyed: () => false,
        send(channel, payload) { sends.push({ channel, payload }); },
        once(event, cb) {
            events.push(event);
            handlers[event] = cb;
        }
    };
}

function mockChild() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => child.emit('close', 0);
    return child;
}

{
    const wc = mockWebContents();
    const child = mockChild();
    const mgr = createLogStreamManager({
        getToolPath: () => 'adb.exe',
        buildArgs: (id) => ['-s', id, 'logcat', '-v', 'time', '-T', '200'],
        errorLabel: 'Logcat',
        spawnImpl: () => child
    });
    const result = await mgr.startLogStream('emu-1', wc);
    assert.equal(result.status, 'success');
    assert.deepStrictEqual(wc.events, ['destroyed']);
    child.stdout.emit('data', Buffer.from('08-22 09:18:14.857 D/WebView( 12): hello\n'));
    await new Promise(r => setTimeout(r, 80));
    assert.equal(wc.sends[0].channel, 'logcat-chunk');
    assert.match(wc.sends[0].payload, /hello/);
}

{
    const wc = mockWebContents();
    const child = mockChild();
    const mgr = createLogStreamManager({
        getToolPath: () => 'hdc',
        buildArgs: () => ['-t', 'dev', 'shell', 'hilog'],
        errorLabel: 'Hilog',
        spawnImpl: () => child
    });
    await mgr.startLogStream('dev', wc);
    child.emit('close', 0);
    assert.equal(wc.sends.length, 1);
    assert.equal(wc.sends[0].channel, 'logcat-error');
    assert.match(wc.sends[0].payload, /without log output/i);
}

{
    const wc = mockWebContents();
    const mgr = createLogStreamManager({
        getToolPath: () => 'missing-bin',
        buildArgs: () => [],
        errorLabel: 'Logcat',
        spawnImpl: () => {
            const child = mockChild();
            queueMicrotask(() => child.emit('error', new Error('spawn ENOENT')));
            return child;
        }
    });
    const result = await mgr.startLogStream('emu', wc);
    assert.equal(result.status, 'success');
    await new Promise(r => setTimeout(r, 20));
    assert.ok(wc.sends.some(item => item.channel === 'logcat-error' && /ENOENT/.test(item.payload)));
}

{
    const result = await createLogStreamManager({
        getToolPath: () => 'adb',
        buildArgs: () => [],
        errorLabel: 'Logcat',
        spawnImpl: () => mockChild()
    }).startLogStream('', mockWebContents());
    assert.equal(result.status, 'error');
}

{
    const wc = mockWebContents();
    const child = mockChild();
    const mgr = createLogStreamManager({
        getToolPath: () => 'adb.exe',
        buildArgs: () => ['logcat'],
        errorLabel: 'Logcat',
        spawnImpl: () => child
    });
    await mgr.startLogStream('emu-1', wc);
    child.stderr.emit('data', Buffer.from('* daemon not running; starting now at tcp:5037\n* daemon started successfully\n'));
    assert.equal(wc.sends.length, 0, 'adb daemon startup must not fail the stream');
}

{
    const wc = mockWebContents();
    const child = mockChild();
    const mgr = createLogStreamManager({
        getToolPath: () => 'adb.exe',
        buildArgs: () => ['logcat'],
        errorLabel: 'Logcat',
        spawnImpl: () => child
    });
    await mgr.startLogStream('emu-1', wc);
    child.stdout.emit('data', Buffer.from('08-22 09:18:14.857 D/TAG( 1): hello\n'));
    await new Promise(r => setTimeout(r, 80));
    mgr.stopLogStream('emu-1', wc);
    child.emit('close', 1);
    assert.ok(!wc.sends.some(item => item.channel === 'logcat-error'), 'intentional stop must not report exit 1');
}

{
    const wc = mockWebContents();
    const child = mockChild();
    const mgr = createLogStreamManager({
        getToolPath: () => 'adb.exe',
        buildArgs: () => ['logcat'],
        errorLabel: 'Logcat',
        spawnImpl: () => child
    });
    await mgr.startLogStream('emu-1', wc);
    child.stderr.emit('data', Buffer.from('error: device unauthorized\n'));
    child.emit('close', 1);
    const err = wc.sends.find(item => item.channel === 'logcat-error');
    assert.ok(err, 'real failure must surface');
    assert.match(err.payload, /unauthorized|exited with code 1/i);
}

console.log('log-stream tests passed');
