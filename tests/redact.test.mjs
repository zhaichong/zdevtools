/**
 * 脱敏函数测试 — 可以直接扩展为 Vitest 测试
 * 当前使用 Node 原生 assert（无 test runner）。
 * 后续引入 Vitest 后无需改动测试内容，只需改 test runner 命令。
 */
import { redact } from '../src/shared/utils/redact.js';
import assert from 'assert';

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
    } catch (e) {
        console.error(`  ✗ ${name}: ${e.message}`);
        process.exitCode = 1;
    }
}

console.log('\nredact tests:');

test('redacts Bearer token (standalone, not part of a key-value pair)', () => {
    // 修复后，优先执行 BEARER_RE，整个 bearer 及后续 token 被正确清除
    const result = redact('token Bearer abc123.def456.ghi789 in text');
    assert.strictEqual(result, 'token Bearer [REDACTED] in text');
});

test('redacts Bearer token when it starts the string (no preceding key)', () => {
    const result = redact('Bearer abc123.def456.ghi789');
    assert.strictEqual(result, 'Bearer [REDACTED]');
});

test('redacts Authorization header (colon separator)', () => {
    const result = redact('Authorization: Bearer abc123.def456.ghi789');
    assert.match(result, /\[REDACTED\]/);
    assert.strictEqual(result, 'Authorization: Bearer [REDACTED]');
});

test('redacts access_token in URL', () => {
    const result = redact('?access_token=my-secret-token&other=keep');
    assert.match(result, /\[REDACTED\]/);
    assert.ok(result.includes('other=keep'));
});

test('redacts password in JSON-like text', () => {
    const result = redact('{"password": "s3cret!", "user": "admin"}');
    assert.match(result, /\[REDACTED\]/);
    assert.ok(result.includes('admin'));
});

test('redacts client_secret', () => {
    const result = redact('client_secret=super-secret-value');
    assert.match(result, /\[REDACTED\]/);
});

test('redacts expanded sensitive keys (api_key, secret, cookie, session)', () => {
    assert.strictEqual(redact('api_key=my-key123'), 'api_key=[REDACTED]');
    assert.strictEqual(redact('{"secret": "xyz789"}'), '{"secret": "[REDACTED]"}');
    assert.strictEqual(redact('Cookie: session=abcdef123'), 'Cookie: session=[REDACTED]'); // "Cookie" isn't a key matched here, but "session" is.
});

test('handles null/undefined without throwing', () => {
    assert.strictEqual(redact(null), '');
    assert.strictEqual(redact(undefined), '');
    assert.strictEqual(redact(''), '');
});

test('redacts auth key-value secrets (not only Authorization)', () => {
    assert.strictEqual(redact('auth=super-secret-value&keep=1'), 'auth=[REDACTED]&keep=1');
    assert.strictEqual(redact('auth: super-secret-value'), 'auth: [REDACTED]');
    assert.match(redact('{"auth":"super-secret-value"}'), /\[REDACTED\]/);
    assert.ok(!redact('{"auth":"super-secret-value"}').includes('super-secret-value'));
});

test('does not treat author as an auth secret', () => {
    assert.strictEqual(redact('author=alice'), 'author=alice');
});

test('preserves non-sensitive text', () => {
    const result = redact('Hello, normal text with no secrets');
    assert.strictEqual(result, 'Hello, normal text with no secrets');
});

console.log('  -> all passed\n');