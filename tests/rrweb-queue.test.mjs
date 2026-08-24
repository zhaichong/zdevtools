import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const assert = require('assert');
const { createBoundedChunkQueue, sanitizeRrwebChunk } = require('../src/main/ipc/rrweb.js');

let bytesOnDisk = 0;
const writes = [];
const queue = createBoundedChunkQueue({
    maxBytes: 12,
    readSize: async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return bytesOnDisk;
    },
    append: async (_key, text) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        bytesOnDisk += Buffer.byteLength(text, 'utf8');
        writes.push(text);
    },
    clear: async () => { bytesOnDisk = 0; }
});

const results = await Promise.all([
    queue.append('session-a', '123456'),
    queue.append('session-a', 'abcdef'),
    queue.append('session-a', 'overflow')
]);

assert.deepStrictEqual(results, [true, true, false]);
assert.strictEqual(bytesOnDisk, 12);
assert.deepStrictEqual(writes, ['123456', 'abcdef']);

const masked = sanitizeRrwebChunk(JSON.stringify({
    data: { node: { textContent: '患者 Alice', attributes: { title: 'Alice', class: 'card' } } }
}));
assert.equal(masked.includes('患者 Alice'), false);
assert.equal(masked.includes('Alice'), false);
assert.equal(masked.includes('"class":"card"'), true);

let releaseSlowRead;
const slowQueue = createBoundedChunkQueue({
    maxBytes: 4,
    readSize: () => new Promise(resolve => { releaseSlowRead = () => resolve(0); }),
    append: async () => {},
    clear: async () => {}
});
const firstSlowWrite = slowQueue.append('slow', '1234');
assert.strictEqual(await slowQueue.append('slow', 'x'), false, 'overflow must be rejected before the slow first write completes');
releaseSlowRead();
assert.strictEqual(await firstSlowWrite, true);

await queue.clear('session-a');
assert.strictEqual(await queue.append('session-a', 'fresh'), true);
assert.strictEqual(bytesOnDisk, 5);

console.log('rrweb queue tests passed');
