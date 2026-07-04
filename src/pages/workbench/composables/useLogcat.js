import { ref, shallowRef, triggerRef, reactive, computed, watch } from 'vue';

/** 内存上限 — 超过此数量自动淘汰最旧条目，防止无限增长 */
const MAX_ENTRIES = 50000;

let _id = 0;

/**
 * 解析单行 logcat 输出为结构化对象，支持多种主流格式
 * @param {string} line
 * @returns {object}
 */
function parseLogLine(line) {
    // 1. Threadtime format (adb logcat -v threadtime)
    // Format: 08-22 09:18:14.857  376  376 D TAG : Message
    let match = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.+?):\s*(.*)$/);
    if (match) {
        return {
            id: ++_id, raw: line, parsed: true,
            timestamp: match[1], pid: match[2], tid: match[3],
            level: match[4], tag: match[5].trim(), message: match[6]
        };
    }
    
    // 2. Time format (adb logcat -v time)
    // Format: 08-22 09:18:14.857 D/TAG( 376): Message
    match = line.match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+([VDIWEF])\/(.+?)\(\s*(\d+)\s*\):\s*(.*)$/);
    if (match) {
        return {
            id: ++_id, raw: line, parsed: true,
            timestamp: match[1], pid: match[4], tid: '',
            level: match[2], tag: match[3].trim(), message: match[5]
        };
    }
    
    // 3. Brief format (adb logcat -v brief)
    // Format: D/TAG( 376): Message
    match = line.match(/^([VDIWEF])\/(.+?)\(\s*(\d+)\s*\):\s*(.*)$/);
    if (match) {
        return {
            id: ++_id, raw: line, parsed: true,
            timestamp: '', pid: match[3], tid: '',
            level: match[1], tag: match[2].trim(), message: match[4]
        };
    }
    
    // 未识别的降级原始格式
    return {
        id: ++_id, raw: line, parsed: false,
        timestamp: '', pid: '', tid: '', level: '', tag: '', message: line
    };
}

/**
 * Android Logcat 数据管理 composable (架构级优化版)
 */
export function useLogcat() {
    // 核心优化 1：使用 shallowRef 解除 5w+ 对象的深层 Proxy 性能灾难
    const entries = shallowRef([]);
    const filteredEntries = shallowRef([]);

    const searchText = ref('');
    const filterLevel = ref('all');
    const paused = ref(false);
    const autoScroll = ref(true);
    const matchIndex = ref(0);
    const loading = ref(false);
    const error = ref('');

    // O(1) 累加统计
    const stats = reactive({
        total: 0, verbose: 0, debug: 0, info: 0,
        warning: 0, error: 0, fatal: 0
    });

    const LEVEL_LABELS = {
        V: 'Verbose', D: 'Debug', I: 'Info', W: 'Warning', E: 'Error', F: 'Fatal'
    };

    // ========== 内部工具函数 ==========

    function adjustStats(batch, sign) {
        for (const e of batch) {
            if (!e.parsed) continue;
            stats.total += sign;
            switch (e.level) {
                case 'V': stats.verbose += sign; break;
                case 'D': stats.debug += sign; break;
                case 'I': stats.info += sign; break;
                case 'W': stats.warning += sign; break;
                case 'E': stats.error += sign; break;
                case 'F': stats.fatal += sign; break;
            }
        }
    }

    let searchLower = '';
    
    // 应用当前的过滤规则到指定的日志集合
    function applyFiltersTo(list) {
        if (filterLevel.value === 'all' && !searchLower) return list;
        return list.filter(e => {
            if (filterLevel.value !== 'all' && (!e.parsed || e.level !== filterLevel.value)) return false;
            if (searchLower && !e.raw.toLowerCase().includes(searchLower)) return false;
            return true;
        });
    }

    // 核心优化 2：全量过滤操作提取（仅在条件改变时触发一次）
    function rebuildFilteredEntries() {
        searchLower = searchText.value.toLowerCase();
        filteredEntries.value = applyFiltersTo(entries.value);
        if (autoScroll.value && filteredEntries.value.length > 0) {
            matchIndex.value = filteredEntries.value.length - 1; // 自动滚屏模式下直接跳到最新匹配
        } else {
            matchIndex.value = 0; // 重置匹配游标
        }
    }

    watch([filterLevel, searchText], () => {
        rebuildFilteredEntries();
    }, { flush: 'sync' });

    // 状态流 API 绑定
    let cleanupData = null;
    let cleanupError = null;

    function startStream(deviceId) {
        if (!deviceId) {
            error.value = '缺少 deviceId，无法启动 logcat';
            return;
        }
        
        loading.value = entries.value.length === 0;
        error.value = '';
        
        if (cleanupData) { cleanupData(); cleanupData = null; }
        if (cleanupError) { cleanupError(); cleanupError = null; }

        cleanupData = window.electronAPI.onLogcatData((lines) => {
            if (loading.value) loading.value = false;
            if (paused.value) return;
            if (!lines || lines.length === 0) return;

            const newEntries = lines.map(parseLogLine);
            let newArray = entries.value.concat(newEntries);
            let removed = [];
            const excess = newArray.length - MAX_ENTRIES;
            if (excess > 0) {
                removed = newArray.slice(0, excess);
                newArray = newArray.slice(excess);
                adjustStats(removed, -1);
            }
            adjustStats(newEntries, 1);
            entries.value = newArray; // triggers reactivity

            const isFilterActive = filterLevel.value !== 'all' || searchLower !== '';
            if (!isFilterActive) {
                filteredEntries.value = newArray;
            } else {
                const newMatching = applyFiltersTo(newEntries);
                if (newMatching.length > 0 || excess > 0) {
                    let newFiltered = filteredEntries.value.concat(newMatching);
                    if (excess > 0 && removed.length > 0) {
                        const maxRemovedId = removed[removed.length - 1].id;
                        let removeCount = 0;
                        while (removeCount < newFiltered.length && newFiltered[removeCount].id <= maxRemovedId) {
                            removeCount++;
                        }
                        if (removeCount > 0) {
                            newFiltered = newFiltered.slice(removeCount);
                        }
                    }
                    filteredEntries.value = newFiltered; // triggers reactivity
                }
            }
        });

        cleanupError = window.electronAPI.onLogcatError((errMsg) => {
            error.value = `获取 logcat 失败: ${errMsg}`;
            loading.value = false;
        });

        window.electronAPI.startLogcat(deviceId).then((result) => {
            if (result?.status === 'error') {
                error.value = result.message || '启动 logcat 失败';
                loading.value = false;
            }
        }).catch((err) => {
            error.value = `启动 logcat 失败: ${err.message}`;
            loading.value = false;
        });
    }

    function stopStream(deviceId) {
        if (cleanupData) { cleanupData(); cleanupData = null; }
        if (cleanupError) { cleanupError(); cleanupError = null; }
        if (deviceId) {
            window.electronAPI.stopLogcat(deviceId);
        }
    }

    function clear() {
        entries.value = [];
        filteredEntries.value = [];
        stats.total = 0; stats.verbose = 0; stats.debug = 0;
        stats.info = 0; stats.warning = 0; stats.error = 0; stats.fatal = 0;
        matchIndex.value = 0;
        error.value = '';
    }

    function togglePause() { paused.value = !paused.value; }
    function toggleAutoScroll() { autoScroll.value = !autoScroll.value; }

    const matchCount = computed(() => {
        return searchText.value ? filteredEntries.value.length : 0;
    });

    const currentMatchEntry = computed(() => {
        if (matchCount.value === 0) return null;
        const idx = Math.min(matchIndex.value, matchCount.value - 1);
        return filteredEntries.value[idx] || null;
    });

    function nextMatch() {
        if (matchCount.value === 0) return;
        matchIndex.value = (matchIndex.value + 1) % matchCount.value;
    }

    function prevMatch() {
        if (matchCount.value === 0) return;
        matchIndex.value = (matchIndex.value - 1 + matchCount.value) % matchCount.value;
    }

    // 公开暴露供 View 直接使用的最终列表：若无过滤，直接透传原数组
    const displayEntries = computed(() => {
        if (filterLevel.value !== 'all' || searchText.value) {
            return filteredEntries.value;
        }
        return entries.value;
    });

    return {
        entries,
        filteredEntries: displayEntries, // 视图层统一绑定此属性
        searchText,
        filterLevel,
        paused,
        autoScroll,
        matchIndex,
        loading,
        error,
        stats,
        LEVEL_LABELS,
        matchCount,
        currentMatchEntry,
        rebuildFilteredEntries, // 暴露给外部调用（当参数改变时）
        startStream,
        stopStream,
        clear,
        togglePause,
        toggleAutoScroll,
        nextMatch,
        prevMatch
    };
}
