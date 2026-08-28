import assert from 'assert';
import { useReport } from '../src/pages/workbench/composables/useReport.js';
import { sourceHint, formatTime } from '../src/shared/utils/format.js';

console.log('\nuseReport & format tests:');

const { buildMarkdown, buildCauseText, fallbackReport, buildReport } = useReport();

// 1. report.profile 为 null 时的安全性测试
{
    const reportWithoutProfile = {
        profile: null,
        target: { url: 'http://example.com/test' },
        snapshot: null,
        sourceMaps: { uploaded: 0, matched: 0 },
        causes: [{ priority: 'P0', title: '崩溃', summary: '内存溢出', next: '重启', owner: '前端', trigger: '', source: null }],
        breadcrumbs: [],
        logcat: []
    };
    const md = buildMarkdown(reportWithoutProfile);
    assert.ok(md.includes('- 项目: 通用 Web 应用'));
    assert.ok(md.includes('- 页面: http://example.com/test'));
    assert.ok(md.includes('P0 崩溃'));

    const causeText = buildCauseText(reportWithoutProfile.causes[0], reportWithoutProfile);
    assert.ok(causeText.includes('项目：通用 Web 应用'));
}

// 2. 空 report 和缺省字段测试
{
    assert.strictEqual(buildMarkdown(null), '');
    const emptyReport = { profile: null, target: null, snapshot: null, causes: [], breadcrumbs: [], logcat: [] };
    const md = buildMarkdown(emptyReport);
    assert.ok(md.includes('- 无'));
}

// 3. sourceHint 边界与 NaN 测试
{
    assert.strictEqual(sourceHint('', 0, 0), '');
    assert.strictEqual(sourceHint('app.js', NaN, NaN), 'app.js:1:1');
    assert.strictEqual(sourceHint('app.js?v=123#hash', 10, 5), 'app.js:11:6');
    assert.strictEqual(sourceHint('webpack:///src/main.js', 2, 4), 'webpack:///src/main.js:3:5');
}

// 4. formatTime 边界与非法时间测试
{
    assert.strictEqual(formatTime(null), '-');
    assert.strictEqual(formatTime('invalid-time-string'), '-');
    assert.ok(formatTime(1700000000000).match(/\d{2}:\d{2}:\d{2}/));
}

// 5. generated reports stay JSON-serializable even with circular snapshot data
{
    const snapshot = { href: 'https://app.test/home?access_token=leak-me' };
    snapshot.self = snapshot;
    const report = buildReport({
        config: { url: 'https://app.test/home?access_token=leak-me', targetId: '2', proxyToken: 'capability-secret' },
        profile: { label: 'Demo' },
        diagnosticRunId: 'run-1',
        snapshot,
        events: [{ type: 'js', fn() {}, skip: Symbol('nope') }],
        causes: [{
            priority: 'P0',
            title: '登录失败',
            summary: 'password=s3cret and auth=super-token',
            next: 'Bearer abc123.def456 rotate',
            owner: '前端',
            trigger: '',
            source: null
        }],
        breadcrumbs: [{ time: 1, type: 'network', message: 'Authorization: Bearer abc123.def456' }],
        sourceStats: { uploaded: 1, matched: 1 },
        logcat: ['token=leak-me']
    });
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);
    assert.equal(parsed.snapshot.self, '[Circular]');
    assert.match(parsed.snapshot.href, /^https:\/\/app\.test\/home\?access_token=\[REDACTED\]$/);
    assert.equal(parsed.causes[0].title, '登录失败');
    assert.equal(parsed.diagnosticRunId, 'run-1');
    assert.equal(parsed.target.proxyToken, undefined);
    assert.ok(!json.includes('capability-secret'), json);
    assert.ok(!parsed.target.url.includes('leak-me'), parsed.target.url);
    assert.ok(!parsed.snapshot.href.includes('leak-me'), parsed.snapshot.href);
    assert.match(parsed.snapshot.href, /\[REDACTED\]/);

    const md = buildMarkdown(report);
    assert.ok(!md.includes('s3cret'), md);
    assert.ok(!md.includes('super-token'), md);
    assert.ok(!md.includes('abc123.def456'), md);
    assert.ok(!md.includes('leak-me'), md);
    assert.match(md, /\[REDACTED\]/);

    const fallback = fallbackReport({ url: 'https://app.test', proxyToken: 'capability-secret' }, null, new Error('cdp down'));
    assert.equal(fallback.target.proxyToken, undefined);
    assert.ok(!JSON.stringify(fallback).includes('capability-secret'));
}

console.log('  -> useReport & format tests passed\n');
