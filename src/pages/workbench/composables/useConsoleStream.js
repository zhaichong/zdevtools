import { ref, computed } from 'vue';
import { normalizeConsoleApi } from '@/shared/utils/cdp-events.js';

const MAX_ENTRIES = 500;

/**
 * 将 CDP RemoteObject 格式化为可读字符串
 */
function formatRemoteObject(obj) {
    if (!obj) return 'undefined';
    if (obj.type === 'undefined') return 'undefined';
    if (obj.type === 'object' && obj.subtype === 'null') return 'null';
    if (obj.type === 'string') return `"${obj.value}"`;
    if (obj.value !== undefined) return String(obj.value);
    if (obj.description) return obj.description;
    if (obj.preview) {
        const props = (obj.preview.properties || [])
            .map(p => `${p.name}: ${p.value}`)
            .join(', ');
        return obj.preview.description || `{${props}}`;
    }
    return obj.type || '[object]';
}

/**
 * Real-time console stream composable (Flipper-inspired)
 * Captures all console output levels with filtering and grouping
 * @param {object} cdpClient - useCdpClient instance
 */
export function useConsoleStream(cdpClient) {
    const entries = ref([]);
    const filterLevel = ref('all');
    const searchText = ref('');
    const paused = ref(false);

    let setupDone = false;
    let unsubs = [];
    const LEVEL_LABELS = {
        error: 'Error', warning: 'Warn', warn: 'Warn', info: 'Info',
        log: 'Log', debug: 'Debug', dir: 'Dir', table: 'Table'
    };

    const filteredEntries = computed(() => {
        let list = entries.value;
        if (filterLevel.value !== 'all') {
            list = list.filter(e => e.level === filterLevel.value);
        }
        if (searchText.value) {
            const q = searchText.value.toLowerCase();
            list = list.filter(e => e.text.toLowerCase().includes(q));
        }
        return list;
    });

    const stats = computed(() => {
        const all = entries.value;
        return {
            total: all.length,
            errors: all.filter(e => e.level === 'error').length,
            warnings: all.filter(e => e.level === 'warning' || e.level === 'warn').length
        };
    });

    function addEntry(data) {
        if (paused.value) return;

        // Group identical consecutive messages
        const last = entries.value[entries.value.length - 1];
        if (last && last.text === data.text && last.level === data.level) {
            last.count = (last.count || 1) + 1;
            last.lastTime = data.time;
            return;
        }

        const entry = { ...data, count: 1, lastTime: data.time, id: Date.now() + Math.random() };

        if (entries.value.length >= MAX_ENTRIES) {
            entries.value.shift();
        }
        entries.value.push(entry);
    }

    function setup() {
        if (setupDone) return;
        setupDone = true;
        unsubs.push(cdpClient.onEvent('Runtime.consoleAPICalled', (params) => {
            const data = normalizeConsoleApi(params);
            addEntry(data);
        }));

        // Also capture Runtime.exceptionThrown as console errors
        unsubs.push(cdpClient.onEvent('Runtime.exceptionThrown', (params) => {
            const details = params.exceptionDetails || {};
            const message = details.exception?.description || details.text || 'Runtime exception';
            addEntry({
                level: 'error',
                text: message,
                time: params.timestamp || Date.now(),
                stack: details.stackTrace?.callFrames || [],
                url: details.url
            });
        }));
    }

    function dispose() {
        unsubs.forEach(unsub => unsub());
        unsubs = [];
        setupDone = false;
        clear();
    }

    function clear() {
        entries.value = [];
    }

    function togglePause() {
        paused.value = !paused.value;
    }

    /**
     * 在目标页面执行 JS 表达式（Console REPL）
     */
    async function execute(expression) {
        // 先展示输入
        addEntry({
            level: 'log',
            text: `> ${expression}`,
            time: Date.now(),
            isRepl: true,
            isInput: true
        });
        try {
            const result = await cdpClient.send('Runtime.evaluate', {
                expression,
                returnByValue: false,
                generatePreview: true,
                awaitPromise: true,
                timeout: 10000
            });
            if (result.exceptionDetails) {
                const details = result.exceptionDetails;
                addEntry({
                    level: 'error',
                    text: details.exception?.description || details.text || 'Evaluation failed',
                    time: Date.now(),
                    isRepl: true,
                    stack: details.stackTrace?.callFrames || []
                });
            } else {
                const obj = result.result;
                addEntry({
                    level: 'log',
                    text: formatRemoteObject(obj),
                    time: Date.now(),
                    isRepl: true,
                    type: obj?.type,
                    subtype: obj?.subtype,
                    preview: obj?.preview
                });
            }
        } catch (e) {
            addEntry({
                level: 'error',
                text: `执行失败: ${e.message}`,
                time: Date.now(),
                isRepl: true
            });
        }
    }

    return {
        entries,
        filteredEntries,
        filterLevel,
        searchText,
        paused,
        stats,
        LEVEL_LABELS,
        setup,
        clear,
        togglePause,
        execute,
        dispose
    };
}
