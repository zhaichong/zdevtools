import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const assert = require('assert');
const {
    extractPageTargets,
    fetchCdpTargetList,
    fetchCdpVersion,
    resolvePageDebuggerPath,
    canonicalizePageDebuggerPath,
    isPageDebuggerPath
} = require('../src/shared/utils/inspect-target.cjs');
const hdcDriver = require('../src/server/drivers/hdcDriver.js');

// chrome://inspect /json/list fixture (page + browser + iframe)
const chromeJsonList = [
    {
        description: '',
        devtoolsFrontendUrl: '/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/DAB7FB6187B554E10B0BD18821265734',
        id: 'DAB7FB6187B554E10B0BD18821265734',
        title: 'Home',
        type: 'page',
        url: 'https://www.example.com/',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/DAB7FB6187B554E10B0BD18821265734'
    },
    {
        id: 'browser-guid',
        type: 'browser',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/browser-guid'
    },
    {
        id: 'IFRAME1',
        type: 'iframe',
        title: 'embed',
        url: 'https://www.example.com/embed',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/IFRAME1'
    }
];

// HarmonyOS ArkWeb /json/list (numeric page id, localhost)
const harmonyJsonList = [
    {
        description: '',
        id: '2',
        title: 'example',
        type: 'page',
        url: 'https://example.com',
        webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/2'
    },
    {
        id: 0,
        type: 'page',
        title: 'numeric-zero',
        url: 'https://example.com/zero',
        webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/0'
    }
];

{
    const pages = extractPageTargets(chromeJsonList, 'emu-1', 9222, 'chrome_devtools_remote');
    assert.equal(pages.length, 2, 'browser target must not be listed');
    assert.equal(pages[0].id, 'DAB7FB6187B554E10B0BD18821265734');
    assert.equal(pages[0].type, 'page');
    assert.equal(pages[0].wsDebuggerPath, '/devtools/page/DAB7FB6187B554E10B0BD18821265734');
    assert.equal(pages[0].localPort, 9222);
    assert.equal(pages[0].deviceId, 'emu-1');
    assert.equal(pages[1].type, 'iframe');
    assert.equal(pages[1].wsDebuggerPath, '/devtools/page/IFRAME1');
    assert.ok(pages.every(p => !/\/devtools\/browser/i.test(p.wsDebuggerPath)));
}

{
    const sneaky = extractPageTargets([{
        id: 'not-a-page',
        type: 'page',
        webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/%2e%2e%2fbrowser'
    }], 'emu-1', 9222, 'chrome_devtools_remote');
    assert.equal(sneaky.length, 1);
    assert.equal(sneaky[0].wsDebuggerPath, '/devtools/page/not-a-page');
    assert.doesNotMatch(sneaky[0].wsDebuggerPath, /browser|\.\./);
}

{
    const pages = hdcDriver.extractPageTargets(harmonyJsonList, '70d2a3e2', 9222, 'webview_devtools_remote_3458');
    assert.equal(pages.length, 2);
    assert.equal(pages[0].id, '2');
    assert.equal(pages[0].wsDebuggerPath, '/devtools/page/2');
    assert.equal(pages[1].id, '0', 'numeric id 0 must stay listable');
    assert.equal(pages[1].wsDebuggerPath, '/devtools/page/0');
    assert.equal(pages[1].title, 'numeric-zero');
}

{
    const skipped = extractPageTargets([
        { id: 'x', type: 'page' },
        null,
        { type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/no-id' },
        { id: 'svc', type: 'service_worker', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/svc' }
    ], 'dev', 9223, 'sock');
    assert.equal(skipped.length, 2);
    assert.equal(skipped[0].wsDebuggerPath, '/devtools/page/x');
    assert.equal(skipped[1].id, 'svc');
}

assert.equal(isPageDebuggerPath('/devtools/page/2'), true);
assert.equal(isPageDebuggerPath('/devtools/browser/abc'), false);
assert.equal(resolvePageDebuggerPath({
    webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/ABC'
}), '/devtools/page/ABC');
assert.equal(resolvePageDebuggerPath({
    wsDebuggerPath: 'ws://127.0.0.1:9222/devtools/page/ABC'
}), '/devtools/page/ABC');
assert.equal(resolvePageDebuggerPath({
    wsDebuggerPath: '/devtools/browser/xyz',
    targetId: 'page-1'
}), '/devtools/page/page-1');
assert.equal(resolvePageDebuggerPath({ targetId: 'page-1' }), '/devtools/page/page-1');
assert.equal(resolvePageDebuggerPath({
    wsDebuggerPath: '/devtools/browser/xyz',
    webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/xyz'
}), '');
assert.equal(resolvePageDebuggerPath({
    webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/%2e%2e%2fbrowser',
    targetId: 'safe-page'
}), '/devtools/page/safe-page');
assert.equal(canonicalizePageDebuggerPath('/devtools/page/%2e%2e%2fbrowser'), '');
assert.equal(canonicalizePageDebuggerPath('/devtools/page/0%3A1'), '/devtools/page/0:1');

{
    const calls = [];
    const requestJson = async (url) => {
        calls.push(url);
        if (url.endsWith('/json/list')) return { ok: false, data: [] };
        if (url.endsWith('/json')) return { ok: true, data: harmonyJsonList };
        return { ok: false, data: [] };
    };
    const result = await fetchCdpTargetList(requestJson, 9222);
    assert.deepStrictEqual(calls, [
        'http://127.0.0.1:9222/json/list',
        'http://127.0.0.1:9222/json'
    ]);
    assert.equal(result.ok, true);
    assert.equal(result.data[0].id, '2');
}

{
    const requestJson = async (url) => {
        if (url.endsWith('/json/version')) {
            return {
                ok: true,
                data: {
                    'Android-Package': 'com.example.app',
                    'Browser': 'Chrome/83.0.4103.120'
                }
            };
        }
        return { ok: false, data: [] };
    };
    const version = await fetchCdpVersion(requestJson, 9222);
    assert.equal(version['Android-Package'], 'com.example.app');
    assert.equal(version['Browser'], 'Chrome/83.0.4103.120');

    const failRequest = async () => ({ ok: false, data: [] });
    const failVersion = await fetchCdpVersion(failRequest, 9222);
    assert.equal(failVersion, null);
}

console.log('inspect-target tests passed');

