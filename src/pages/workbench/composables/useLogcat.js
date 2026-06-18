import { ref, reactive, computed } from 'vue';
import { RingBuffer } from '@/shared/utils/ring-buffer.js';

/**
 * Logcat 行解析正则 — 匹配 adb logcat -v time 输出格式：
 * MM-DD HH:MM:SS.mmm   PID   TID  LEVEL  TAG: MESSAGE
 */
const LINE_RE = /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.+?):\s*(.*)$/;

/** 内存上限 — 超过此数量自动淘汰最旧条目，防止无限增长 */
const MAX_ENTRIES = 50000;

let _id = 0;

/**
 * 解析单行 logcat 输出为结构化对象
 * @param {string} line
 * @returns {object}
 */
function parseLogLine(line) {
    const match = line.match(LINE_RE);
    if (!match) {
        return {
            id: ++_id,
            raw: line,
            parsed: false,
            timestamp: '',
            pid: '',
            tid: '',
            level: '',
            tag: '',
            message: line
        };
    }
    return {
        id: ++_id,
        raw: line,
        parsed: true,
        timestamp: match[1],
        pid: match[2],
        tid: match[3],
        level: match[4],
        tag: match[5],
        message: match[6]
    };
}

/**
 * Android Logcat 数据管理 composable
 *
 * 数据流架构：
 * - 后端 ADB 用 spawn 流式拉取，不加 -t 限制，-T 增量过滤
 * - 前端用 RingBuffer(50000) 做 O(1) 内存淘汰
 * - entries 使用增量 push/splice，避免全量数组替换触发 Vue 全量 diff
 * - stats 使用 reactive 累加器，O(1) 更新，消除 350K 次/轮的无效遍历
 * - 视图层用 vue-virtual-scroller (RecycleScroller) 做 DOM 回收
 */
export function useLogcat() {
    const ring = new RingBuffer(MAX_ENTRIES);
    const entries = ref([]);
    let lastTimestamp = null;
    const searchText = ref('');
    const filterLevel = ref('all');
    const paused = ref(false);
    const autoScroll = ref(true);
    const matchIndex = ref(0);
    const loading = ref(false);
    const error = ref('');

    // O(1) 累加统计 — 替代每次 poll 遍历 50K 条 × 7 次 filter
    const stats = reactive({
        total: 0,
        verbose: 0,
        debug: 0,
        info: 0,
        warning: 0,
        error: 0,
        fatal: 0
    });

    const LEVEL_LABELS = {
        V: 'Verbose', D: 'Debug', I: 'Info', W: 'Warning', E: 'Error', F: 'Fatal'
    };

    // ========== 私有辅助 ==========

    /** 全量重建统计（仅首次加载时使用） */
    function rebuildStats() {
        stats.total = entries.value.length;
        stats.verbose = 0; stats.debug = 0; stats.info = 0;
        stats.warning = 0; stats.error = 0; stats.fatal = 0;
        for (const e of entries.value) {
            if (!e.parsed) continue;
            stats.total++;
            incLevel(stats, e.level, 1);
        }
        // total 已设为 length，不需要重加
        stats.total = entries.value.length;
    }

    /** 对一批条目增量调整统计（sign = 1 增加, -1 减少） */
    function adjustStats(batch, sign) {
        for (const e of batch) {
            if (!e.parsed) continue;
            stats.total += sign;
            incLevel(stats, e.level, sign);
        }
    }

    function incLevel(s, level, sign) {
        switch (level) {
            case 'V': s.verbose += sign; break;
            case 'D': s.debug += sign; break;
            case 'I': s.info += sign; break;
            case 'W': s.warning += sign; break;
            case 'E': s.error += sign; break;
            case 'F': s.fatal += sign; break;
        }
    }

    // ========== 公开 API ==========

    /**
     * 过滤后的日志条目：先级别过滤，再搜索过滤
     */
    const filteredEntries = computed(() => {
        let list = entries.value;
        if (filterLevel.value !== 'all') {
            list = list.filter(e => e.parsed && e.level === filterLevel.value);
        }
        if (searchText.value) {
            const q = searchText.value.toLowerCase();
            list = list.filter(e => e.raw.toLowerCase().includes(q));
        }
        return list;
    });

    /**
     * 当前搜索匹配总数
     */
    const matchCount = computed(() => {
        return searchText.value ? filteredEntries.value.length : 0;
    });

    /**
     * 当前匹配条目（用于视图层的 scroll-into-view 定位）
     */
    const currentMatchEntry = computed(() => {
        if (matchCount.value === 0) return null;
        const idx = Math.min(matchIndex.value, matchCount.value - 1);
        return filteredEntries.value[idx] || null;
    });

    /**
     * 从设备拉取 logcat 日志
     * - 首次：全量 dump（since=null），清空 RingBuffer 重建
     * - 后续：增量拉取（since=上次最后一条时间戳），仅追加新行
     *
     * 核心优化：不再调用 ring.toArray() + entries.value = newArray，
     * 而是直接将新条目 push 到反应式数组，Vue 只会 patch 新增 DOM 节点。
     *
     * @param {string} deviceId
     */
    async function fetchLogcat(deviceId) {
        loading.value = true;
        error.value = '';
        try {
            const since = lastTimestamp;
            const data = await window.electronAPI.getLogcat(deviceId, since);
            if (data.status === 'error') {
                error.value = data.message || 'logcat failed';
                return;
            }
            if (paused.value) return;

            const lines = data.lines || [];
            if (lines.length === 0) return;

            // 解析并收集新条目（同时灌入 RingBuffer）
            const newEntries = [];
            for (const line of lines) {
                const entry = parseLogLine(line);
                ring.push(entry);
                newEntries.push(entry);
            }

            if (!since) {
                // ── 首次全量：清空 + 全量重建 ──
                entries.value = ring.toArray();
                rebuildStats();
            } else {
                // ── 增量：push 追加 + 削头 ──
                entries.value.push(...newEntries);

                // 超出上限时淘汰最旧条目
                const excess = entries.value.length - MAX_ENTRIES;
                if (excess > 0) {
                    const removed = entries.value.splice(0, excess);
                    adjustStats(removed, -1);
                }

                // 增量更新统计
                adjustStats(newEntries, 1);
            }

            // 记录最后一条已解析行的时间戳，供下次增量拉取
            for (let i = newEntries.length - 1; i >= 0; i--) {
                if (newEntries[i].parsed && newEntries[i].timestamp) {
                    lastTimestamp = newEntries[i].timestamp;
                    break;
                }
            }
        } catch (e) {
            error.value = `获取 logcat 失败: ${e.message}`;
        } finally {
            loading.value = false;
        }
    }

    function clear() {
        ring.clear();
        lastTimestamp = null;
        entries.value = [];
        stats.total = 0; stats.verbose = 0; stats.debug = 0;
        stats.info = 0; stats.warning = 0; stats.error = 0; stats.fatal = 0;
        matchIndex.value = 0;
        error.value = '';
    }

    function togglePause() {
        paused.value = !paused.value;
    }

    function toggleAutoScroll() {
        autoScroll.value = !autoScroll.value;
    }

    /**
     * 跳转到下一个匹配（越界循环）
     */
    function nextMatch() {
        if (matchCount.value === 0) return;
        matchIndex.value = (matchIndex.value + 1) % matchCount.value;
    }

    /**
     * 跳转到上一个匹配（越界循环）
     */
    function prevMatch() {
        if (matchCount.value === 0) return;
        matchIndex.value = (matchIndex.value - 1 + matchCount.value) % matchCount.value;
    }

    return {
        // 状态
        entries,
        filteredEntries,
        searchText,
        filterLevel,
        paused,
        autoScroll,
        matchIndex,
        loading,
        error,
        // O(1) 累加统计
        stats,
        // 常量
        LEVEL_LABELS,
        // 计算属性
        matchCount,
        currentMatchEntry,
        // 方法
        fetchLogcat,
        clear,
        togglePause,
        toggleAutoScroll,
        nextMatch,
        prevMatch
    };
}
