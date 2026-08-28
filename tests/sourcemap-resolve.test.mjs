import assert from 'assert';
import { useSourceMap } from '../src/pages/workbench/composables/useSourceMap.js';
import { extractCallFrames } from '../src/shared/utils/stack.js';

console.log('\nuseSourceMap resolveSource tests:');

const { resolveSource, sourceMaps } = useSourceMap();

// 注入模拟的 map
sourceMaps.set('app.js.map', {
    fileName: 'app.js.map',
    map: { sources: ['src/views/Home.vue'], names: [] },
    mappings: [
        [{ generatedColumn: 0, source: 0, originalLine: 41, originalColumn: 10 }]
    ]
});

// 1. 测试跨越无 map 的 runtime 帧（如 vue.runtime.esm.js），成功解析业务帧（app.js）
{
    const stack = [
        { url: 'https://cdn.test/vue.runtime.esm.js', lineNumber: 1800, columnNumber: 12 },
        { url: 'https://app.test/js/app.js', lineNumber: 1, columnNumber: 1 }
    ];

    const resolved = resolveSource(stack);
    assert.strictEqual(resolved.mode, 'source-map', 'Should skip unmapped runtime frame and resolve app.js');
    assert.strictEqual(resolved.source, 'src/views/Home.vue');
    assert.strictEqual(resolved.line, 42);
    assert.strictEqual(resolved.column, 11);
}

// 1b. 第一帧有 map 但行列未命中时，继续解析后续业务帧
{
    sourceMaps.set('runtime.js.map', {
        fileName: 'runtime.js.map',
        map: { sources: ['vendor/runtime.js'], names: [] },
        mappings: [
            [{ generatedColumn: 0, source: 0, originalLine: 1, originalColumn: 0 }]
        ]
    });
    const stack = [
        { url: 'https://cdn.test/runtime.js', lineNumber: 99, columnNumber: 40 },
        { url: 'https://app.test/js/app.js', lineNumber: 1, columnNumber: 1 }
    ];
    const resolved = resolveSource(stack);
    assert.strictEqual(resolved.mode, 'source-map');
    assert.strictEqual(resolved.source, 'src/views/Home.vue');
}

// 2. 测试所有帧均无 map 时安全回退到第一帧 bundle 信息
{
    const stack = [
        { url: 'https://cdn.test/vendor.js', lineNumber: 10, columnNumber: 5 },
        { url: 'https://cdn.test/other.js', lineNumber: 20, columnNumber: 8 }
    ];
    const resolved = resolveSource(stack);
    assert.strictEqual(resolved.mode, 'bundle');
    assert.strictEqual(resolved.file, 'vendor.js');
}

// 3. 空 stack 处理
{
    assert.strictEqual(resolveSource([]).mode, 'anonymous');
    assert.strictEqual(resolveSource(null).mode, 'anonymous');
}

// CDP callFrames are 0-based; extractCallFrames must convert before resolveSource
{
    const frames = extractCallFrames([
        { functionName: 'render', url: 'https://cdn.test/vue.runtime.esm.js', lineNumber: 1799, columnNumber: 11 },
        { functionName: 'setup', url: 'https://app.test/js/app.js', lineNumber: 0, columnNumber: 0 }
    ]);
    const resolved = resolveSource(frames);
    assert.strictEqual(resolved.mode, 'source-map');
    assert.strictEqual(resolved.source, 'src/views/Home.vue');
}

console.log('  -> useSourceMap tests passed\n');
