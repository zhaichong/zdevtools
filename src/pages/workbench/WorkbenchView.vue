<script setup>
import { ref, reactive, computed, onMounted, toRef, nextTick } from 'vue';
import { useWorkbenchSession } from './composables/useWorkbenchSession.js';
import { resolvePageDebuggerPath } from '@/shared/utils/inspect-target.cjs';
import RailNav from './components/RailNav.vue';
import DevToolsFrame from './components/DevToolsFrame.vue';
import LogcatView from './components/LogcatView.vue';

const props = defineProps({
    target: {
        type: Object,
        required: true
    }
});

const emit = defineEmits(['close']);

const config = reactive({
    key: props.target.key || `${props.target.driverType || 'adb'}:${props.target.deviceId || '*'}:${props.target.port}:${props.target.targetId}`,
    port: props.target.port,
    targetId: props.target.targetId,
    wsDebuggerPath: resolvePageDebuggerPath({
        wsDebuggerPath: props.target.wsDebuggerPath,
        webSocketDebuggerUrl: props.target.webSocketDebuggerUrl,
        targetId: props.target.targetId
    }),
    proxyToken: '',
    deviceId: props.target.deviceId || '',
    title: props.target.title || 'Untitled',
    url: props.target.url || '',
    model: props.target.model || '',
    driverType: props.target.driverType || ''
});

const activePanel = ref('devtools');
const hasActivatedDevtools = ref(false);
const embeddedDevtoolsOpen = ref(false);
let panelSwitchInFlight = false;

const {
    statusText, statusType, logcatManager, setStatus, onPanelChange
} = useWorkbenchSession(config);

const logEntries = toRef(() => logcatManager.entries.value);
const logFiltered = toRef(() => logcatManager.filteredEntries.value);
const logSearchText = toRef(() => logcatManager.searchText.value);
const logFilterLevel = toRef(() => logcatManager.filterLevel.value);
const logPaused = toRef(() => logcatManager.paused.value);
const logAutoScroll = toRef(() => logcatManager.autoScroll.value);
const logMatchIndex = toRef(() => logcatManager.matchIndex.value);
const logMatchCount = toRef(() => logcatManager.matchCount.value);
const logLoading = toRef(() => logcatManager.loading.value);
const logError = toRef(() => logcatManager.error.value);

function setLogSearchText(value) { logcatManager.searchText.value = value; }
function setLogFilterLevel(value) { logcatManager.filterLevel.value = value; }

onMounted(async () => {
    if (!config.port || !config.targetId) {
        setStatus('参数缺失', 'error');
        return;
    }
    config.proxyToken = await window.electronAPI?.getWsProxyToken?.() || '';
    if (!config.proxyToken) {
        setStatus('安全代理初始化失败', 'error');
        return;
    }
    logcatManager.startStream(config.deviceId, config.driverType);
    hasActivatedDevtools.value = true;
    embeddedDevtoolsOpen.value = true;
    setStatus('DevTools 已连接', '');
});

const devtoolsUrl = computed(() => {
    if (!hasActivatedDevtools.value) return '';
    const pagePath = resolvePageDebuggerPath({
        wsDebuggerPath: config.wsDebuggerPath,
        targetId: config.targetId
    });
    if (!pagePath || !config.proxyToken) return '';
    const cleanPath = pagePath.replace(/^\//, '');
    const separator = cleanPath.includes('?') ? '&' : '?';
    const wsUrl = `${location.host}/ws-proxy/${config.port}/${cleanPath}${separator}ztools_token=${encodeURIComponent(config.proxyToken)}`;
    return `/devtools/inspector.html?ws=${encodeURIComponent(wsUrl)}&theme=dark`;
});

const counts = computed(() => ({
    logcat: logEntries.value.length
}));

async function onSelectPanel(panel) {
    if (panel === activePanel.value || panelSwitchInFlight) return;
    panelSwitchInFlight = true;
    const leavingDevtools = activePanel.value === 'devtools';
    try {
        if (leavingDevtools) embeddedDevtoolsOpen.value = false;
        activePanel.value = panel;
        if (panel === 'devtools') {
            hasActivatedDevtools.value = true;
            embeddedDevtoolsOpen.value = true;
        }
        if (leavingDevtools) await nextTick();
        await onPanelChange(panel);
    } finally {
        panelSwitchInFlight = false;
    }
}
</script>

<template>
    <div class="flex flex-col w-full h-full bg-white text-zinc-900">
        <Teleport to="#workbench-actions">
            <span class="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white shadow-3xs font-medium" :class="statusType === 'error' ? 'text-red-700 border-red-200 bg-red-50 font-bold' : 'text-zinc-500'">{{ statusText }}</span>
            <button @click="emit('close')" class="text-zinc-450 hover:text-zinc-850 p-1.5 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-250 transition-colors ml-2 cursor-pointer" title="关闭调试会话">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </Teleport>

        <div class="flex flex-1 overflow-hidden">
            <RailNav
                :active-panel="activePanel"
                :counts="counts"
                @select-panel="onSelectPanel"
            />
            <section class="flex-1 relative bg-white border-l border-zinc-200 flex overflow-hidden">
                <div class="flex-1 w-full h-full relative overflow-hidden flex flex-col">
                    <DevToolsFrame
                        v-if="activePanel === 'devtools' && embeddedDevtoolsOpen && devtoolsUrl"
                        :src="devtoolsUrl"
                    />
                    <div
                        v-else-if="activePanel === 'devtools'"
                        class="flex-1 grid place-items-center text-xs text-zinc-500"
                    >
                        正在连接 DevTools…
                    </div>
                    <LogcatView
                        v-show="activePanel === 'logs'"
                        :entries="logEntries"
                        :filtered-entries="logFiltered"
                        :search-text="logSearchText"
                        :filter-level="logFilterLevel"
                        :paused="logPaused"
                        :auto-scroll="logAutoScroll"
                        :match-index="logMatchIndex"
                        :match-count="logMatchCount"
                        :loading="logLoading"
                        :error="logError"
                        :level-labels="logcatManager.LEVEL_LABELS"
                        :stats="logcatManager.stats"
                        @update:search-text="setLogSearchText"
                        @update:filter-level="setLogFilterLevel"
                        @toggle-pause="logcatManager.togglePause()"
                        @toggle-auto-scroll="logcatManager.toggleAutoScroll()"
                        @clear="logcatManager.clear()"
                        @next-match="logcatManager.nextMatch()"
                        @prev-match="logcatManager.prevMatch()"
                        @refresh="logcatManager.startStream(config.deviceId, config.driverType)"
                    />
                </div>
            </section>
        </div>
    </div>
</template>
