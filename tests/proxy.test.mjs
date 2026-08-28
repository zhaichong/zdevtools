import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const assert = require('assert');
const { isAllowedProxyTarget, extractAuthorizedProxyRequest } = require('../src/server/proxy.js');

// 1. 标准 Chrome / DevTools page 路径
assert.strictEqual(isAllowedProxyTarget(9222, '/devtools/page/F4C470E0DE196B0743B330EE14A895F3'), true);
assert.strictEqual(isAllowedProxyTarget(9220, '/devtools/page/0'), true);
assert.strictEqual(isAllowedProxyTarget('9222', '/devtools/page/123'), true);

// 2. 特殊字符与复杂 targetId（鸿蒙、微信、Android WebView、ArkWeb）
assert.strictEqual(isAllowedProxyTarget(9222, '/devtools/page/webview_target@1'), true);
assert.strictEqual(isAllowedProxyTarget(9222, '/devtools/page/pid:1234.page_1'), true);
assert.strictEqual(isAllowedProxyTarget(9222, '/devtools/page/0%3A1'), true);
assert.strictEqual(isAllowedProxyTarget(9222, '/devtools/page/f401-2241-524a'), true);

// 3. 带 query string 参数的请求
assert.strictEqual(isAllowedProxyTarget(9222, '/devtools/page/123?sessionId=ABC'), true);
assert.strictEqual(isAllowedProxyTarget(9222, '/devtools/page/123?ws=localhost:8999&experiments=true'), true);

// 4. 严禁 browser 越权及任意 ws 路径（防止从页面级调试提权）
assert.strictEqual(isAllowedProxyTarget(9222, '/devtools/browser/abc-123'), false);
assert.strictEqual(isAllowedProxyTarget(9222, '/ws/page/abc'), false);

// 5. 范围内的合法端口支持 (9220-9399)
assert.strictEqual(isAllowedProxyTarget(9220, '/devtools/page/1'), true);
assert.strictEqual(isAllowedProxyTarget(9250, '/devtools/page/1'), true);
assert.strictEqual(isAllowedProxyTarget(9399, '/devtools/page/1'), true);

// 6. 范围外及非法端口拒绝
assert.strictEqual(isAllowedProxyTarget(8999, '/devtools/page/1'), false);
assert.strictEqual(isAllowedProxyTarget(9000, '/devtools/page/1'), false);
assert.strictEqual(isAllowedProxyTarget(9400, '/devtools/page/1'), false);
assert.strictEqual(isAllowedProxyTarget(0, '/devtools/page/1'), false);
assert.strictEqual(isAllowedProxyTarget(-1, '/devtools/page/1'), false);
assert.strictEqual(isAllowedProxyTarget(70000, '/devtools/page/1'), false);
assert.strictEqual(isAllowedProxyTarget('abc', '/devtools/page/1'), false);
assert.strictEqual(isAllowedProxyTarget(null, '/devtools/page/1'), false);

// 7. 非法路径拒绝
assert.strictEqual(isAllowedProxyTarget(9222, '/api/targets'), false);
assert.strictEqual(isAllowedProxyTarget(9222, '/etc/passwd'), false);
assert.strictEqual(isAllowedProxyTarget(9222, ''), false);
assert.strictEqual(isAllowedProxyTarget(9222, null), false);

// The proxy capability is required and is removed before forwarding, without
// losing CDP's own query parameters.
assert.deepStrictEqual(
    extractAuthorizedProxyRequest('/ws-proxy/9222/devtools/page/abc?sessionId=target-session&ztools_token=capability', 'capability'),
    { port: '9222', path: '/devtools/page/abc?sessionId=target-session' }
);
assert.strictEqual(extractAuthorizedProxyRequest('/ws-proxy/9222/devtools/page/abc', 'capability'), null);
assert.strictEqual(extractAuthorizedProxyRequest('/ws-proxy/9222/devtools/page/abc?ztools_token=wrong', 'capability'), null);
assert.strictEqual(extractAuthorizedProxyRequest('/ws-proxy/9222/devtools/browser/abc?ztools_token=capability', 'capability'), null);
assert.deepStrictEqual(
    extractAuthorizedProxyRequest('/ws-proxy/9222/devtools/page/2?ztools_token=capability', 'capability'),
    { port: '9222', path: '/devtools/page/2' }
);
assert.strictEqual(
    extractAuthorizedProxyRequest('/ws-proxy/9219/devtools/page/2?ztools_token=capability', 'capability'),
    null
);

assert.strictEqual(isAllowedProxyTarget(9222, '/devtools/page/%2e%2e%2fbrowser'), false);
assert.strictEqual(isAllowedProxyTarget(9222, '/devtools/page/foo%2f..%2fbrowser'), false);
assert.strictEqual(extractAuthorizedProxyRequest('/ws-proxy/9222/devtools/page/%2e%2e%2fbrowser?ztools_token=capability', 'capability'), null);
assert.strictEqual(isAllowedProxyTarget(9222, '/devtools/page/0%3A1'), true);

console.log('proxy tests passed');
