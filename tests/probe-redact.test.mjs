import { createRequire } from 'module';
import vm from 'vm';

const require = createRequire(import.meta.url);
const assert = require('assert');
const { wrapProbeInstaller } = require('../src/shared/utils/probe-installer.cjs');
const { buildRedactSource, redact } = require('../src/shared/utils/redact-rules.cjs');

const source = wrapProbeInstaller(['getAccessToken']);
assert.match(source.trim(), /^\(/, 'payload must be a single IIFE, not top-level const');
assert.doesNotMatch(source, /^\s*const SENSITIVE_KEY_RE/);
assert.match(source, /auth\(\?:orization\)\?/);
assert.match(source, /redact\(location\.href\)/);
assert.ok(source.includes(buildRedactSource().slice(0, 40)));

const injectedRedact = new Function(`${buildRedactSource()}; return redact;`)();
assert.strictEqual(injectedRedact('auth=super-secret-value'), 'auth=[REDACTED]');
assert.ok(!injectedRedact('https://app.test/cb?access_token=leak-me').includes('leak-me'));
assert.strictEqual(redact('auth=super-secret-value'), injectedRedact('auth=super-secret-value'));

const location = { href: 'https://app.test/cb?access_token=leak-me&keep=1' };
const history = {
    pushState() {},
    replaceState() {}
};
const document = {
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; }
};
const windowObj = {
    addEventListener() {},
    removeEventListener() {},
    document,
    console: { error() {}, warn() {} },
    location,
    history
};
const sandbox = {
    window: windowObj,
    document,
    console: windowObj.console,
    location,
    history,
    Date,
    JSON,
    String,
    Error
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
vm.runInContext(source, sandbox);
assert.ok(sandbox.window.__LOCAL_INSPECT_PROBE__.installed, 'second same-realm eval must not throw or wipe the probe');
sandbox.history.pushState({}, '', '/x');
const dump = sandbox.window.__LOCAL_INSPECT_PROBE__.dump();
const route = dump.breadcrumbs.find(item => item.type === 'route');
assert.ok(route, 'probe must record route breadcrumbs');
assert.ok(!String(route.message).includes('leak-me'), route.message);
assert.match(String(route.message), /\[REDACTED\]/);
sandbox.window.__LOCAL_INSPECT_PROBE__.dispose();
vm.runInContext(source, sandbox);
assert.ok(sandbox.window.__LOCAL_INSPECT_PROBE__.installed, 'eval after dispose must reinstall');

console.log('probe-redact tests passed');
