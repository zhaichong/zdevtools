import assert from 'assert';
import { highlightText } from '../src/shared/utils/highlight.js';
import { escapeHtml } from '../src/shared/utils/escape.js';

console.log('\nhighlightText tests:');

// 1. 基本匹配与大小写不敏感
{
    const res = highlightText('Hello World', 'world');
    assert.strictEqual(res, 'Hello <mark class="hl">World</mark>');
}

// 2. 包含 HTML 特殊字符时的安全性（防 XSS）
{
    const res = highlightText('<script>alert(1)</script>', 'alert');
    assert.strictEqual(res, '&lt;script&gt;<mark class="hl">alert</mark>(1)&lt;/script&gt;');
}

// 3. 搜索 HTML 实体关键字（如 amp, lt, gt）绝不会破坏实体
{
    const res = highlightText('Tom & Jerry', 'amp');
    assert.strictEqual(res, 'Tom &amp; Jerry', 'Searching "amp" in "Tom & Jerry" must NOT match inside &amp;');
}
{
    const res = highlightText('a < b', 'lt');
    assert.strictEqual(res, 'a &lt; b', 'Searching "lt" in "a < b" must NOT match inside &lt;');
}

// 4. 搜索特殊字符自身
{
    const res = highlightText('a & b', '&');
    assert.strictEqual(res, 'a <mark class="hl">&amp;</mark> b');
}
{
    const res = highlightText('3 < 5 > 2', '<');
    assert.strictEqual(res, '3 <mark class="hl">&lt;</mark> 5 &gt; 2');
}

// 5. 多个连续与非连续匹配
{
    const res = highlightText('apple banana apple orange', 'apple');
    assert.strictEqual(res, '<mark class="hl">apple</mark> banana <mark class="hl">apple</mark> orange');
}

// 6. 空值与边界处理
{
    assert.strictEqual(highlightText('', 'foo'), '');
    assert.strictEqual(highlightText(null, 'foo'), '');
    assert.strictEqual(highlightText(undefined, 'foo'), '');
    assert.strictEqual(highlightText('hello', ''), 'hello');
    assert.strictEqual(highlightText('hello', null), 'hello');
    assert.strictEqual(highlightText('hello', undefined), 'hello');
    assert.strictEqual(highlightText('<b>bold</b>', ''), '&lt;b&gt;bold&lt;/b&gt;');
}

console.log('  -> highlightText tests passed\n');
