import assert from 'assert';
import { runtimeSnapshotExpression } from '../src/shared/utils/snapshot.js';
import { buildRedactSource, redact } from '../src/shared/utils/redact-rules.cjs';

const expr = runtimeSnapshotExpression();
assert.match(expr, /redact\(location\.href/);
assert.match(expr, /redact\(location\.hash/);
assert.match(expr, /redact\(document\.title/);

const injectedRedact = new Function(`${buildRedactSource()}; return redact;`)();
assert.ok(!injectedRedact('#access_token=leak-me').includes('leak-me'));
assert.ok(!injectedRedact('https://app.test/#token=leak-me').includes('leak-me'));
assert.strictEqual(injectedRedact('auth=super-secret'), redact('auth=super-secret'));

console.log('snapshot-redact tests passed');
