/**
 * 固定容量环形缓冲区 — push 和淘汰均为 O(1)
 *
 * 替代 Array.splice() 方案，避免高频事件下的 O(n) 数组截断和 GC 抖动。
 * 注意：Vue ref 包裹 RingBuffer 不会自动追踪内部变更，
 * 调用方需在适当时机（如 poll 间隔）通过 toArray() 同步到 ref。
 */
export class RingBuffer {
    /** @param {number} [capacity=2000] */
    constructor(capacity = 2000) {
        /** @type {any[]} */
        this.buffer = new Array(capacity);
        /** @type {number} 下一个写入位置 */
        this.head = 0;
        /** @type {number} 当前元素数量 */
        this._size = 0;
        /** @type {number} */
        this.capacity = capacity;
    }

    /**
     * 推入一个元素，超出容量时自动淘汰最旧元素（O(1)）
     * @param {any} item
     */
    push(item) {
        this.buffer[this.head] = item;
        this.head = (this.head + 1) % this.capacity;
        if (this._size < this.capacity) {
            this._size++;
        }
    }

    /**
     * 返回有序快照（从旧到新），O(k) 其中 k = min(size, limit)
     * @param {number} [limit] - 最大返回数量
     * @returns {any[]}
     */
    toArray(limit) {
        if (this._size === 0) return [];
        const len = limit ? Math.min(this._size, limit) : this._size;
        const result = new Array(len);
        // 最旧元素在 (head - size + capacity) % capacity
        const start = (this.head - this._size + this.capacity) % this.capacity;
        for (let i = 0; i < len; i++) {
            result[i] = this.buffer[(start + i) % this.capacity];
        }
        return result;
    }

    /** 当前元素数量 */
    get length() {
        return this._size;
    }

    /** 清空缓冲区 */
    clear() {
        this.head = 0;
        this._size = 0;
        // 帮助 GC（仅清除已使用的槽位）
        for (let i = 0; i < this.capacity; i++) {
            this.buffer[i] = undefined;
        }
    }
}

/**
 * 简单 LRU 缓存 — 基于 Map 的插入顺序迭代
 *
 * 用于替代无界 Map，提供容量上限和 TTL 淘汰。
 * Map 的迭代顺序即为插入顺序，因此直接删除第一个条目即可淘汰最旧项。
 */
export class LRUCache {
    /**
     * @param {object} [options]
     * @param {number} [options.maxSize=50]
     * @param {number} [options.ttl=300000] - TTL 毫秒，默认 5 分钟
     */
    constructor({ maxSize = 50, ttl = 300000 } = {}) {
        /** @type {Map<string, {value: any, ts: number}>} */
        this.map = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl;
    }

    /**
     * 获取值（自动续期时间戳）
     * @param {string} key
     * @returns {any|undefined}
     */
    get(key) {
        const entry = this.map.get(key);
        if (!entry) return undefined;
        if (Date.now() - entry.ts > this.ttl) {
            this.map.delete(key);
            return undefined;
        }
        // 续期：删除后重新插入以更新迭代顺序
        this.map.delete(key);
        this.map.set(key, { value: entry.value, ts: Date.now() });
        return entry.value;
    }

    /**
     * 设置值，容量溢出时淘汰最旧条目
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
        // 淘汰 TTL 过期条目
        this._evictExpired();
        // 淘汰最旧条目直到低于容量
        while (this.map.size >= this.maxSize) {
            const oldest = this.map.keys().next().value;
            this.map.delete(oldest);
        }
        this.map.set(key, { value, ts: Date.now() });
    }

    /** @param {string} key */
    has(key) {
        const entry = this.map.get(key);
        if (!entry) return false;
        if (Date.now() - entry.ts > this.ttl) {
            this.map.delete(key);
            return false;
        }
        return true;
    }

    /** @param {string} key */
    delete(key) {
        return this.map.delete(key);
    }

    get size() {
        return this.map.size;
    }

    clear() {
        this.map.clear();
    }

    /** @private */
    _evictExpired() {
        const now = Date.now();
        for (const [key, entry] of this.map) {
            if (now - entry.ts > this.ttl) {
                this.map.delete(key);
            }
        }
    }
}
