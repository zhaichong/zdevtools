<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useCdpClient } from '@/shared/composables/useCdpClient.js';
import { identifyProject } from '@/shared/composables/useProjectIdentify.js';
import { runtimeSnapshotExpression } from '@/shared/utils/snapshot.js';
import { shortUrl, delay } from '@/shared/utils/format.js';
import { useProbe } from './composables/useProbe.js';
import { useRootCauses } from './composables/useRootCauses.js';
import { useSourceMap } from './composables/useSourceMap.js';
import { useReport } from './composables/useReport.js';
import { useNetworkMonitor } from './composables/useNetworkMonitor.js';
import { useConsoleStream } from './composables/useConsoleStream.js';
import { useLogcat } from './composables/useLogcat.js';
import RootStrip from './components/RootStrip.vue';
import RailNav from './components/RailNav.vue';
import DevToolsFrame from './components/DevToolsFrame.vue';
import DetailDrawer from './components/DetailDrawer.vue';
import NetworkPanel from './components/NetworkPanel.vue';
import ConsolePanel from './components/ConsolePanel.vue';
import DeviceInfoPanel from './components/DeviceInfoPanel.vue';
import LogcatView from './components/LogcatView.vue';
import RrwebPlayerModal from './components/RrwebPlayerModal.vue';

const params = new URLSearchParams(location.search);
const config = reactive({
    port: params.get('port'),
    targetId: params.get('targetId'),
    deviceId: params.get('deviceId') || '',
    title: params.get('title') || 'Untitled',
    url: params.get('url') || '',
    model: params.get('model') || ''
});

const statusText = ref('连接中');
const statusType = ref('busy');
const activePanel = ref('network');
const selectedCauseId = ref('');
const diagnosisOpen = ref(true);
const report = ref(null);
const snapshot = ref(null);
const probe = reactive({ breadcrumbs: [], errors: [], network: [] });
const profile = ref(identifyProject(config.url));
const showRrwebModal = ref(false);

const cdpClient = useCdpClient(config.port, config.targetId, { includeTime: true });
const { injectProbe, pollProbe, setupAutoReinject } = useProbe(cdpClient);
const { buildRootCauses, buildBreadcrumbs, dedupeEvents, normalizeEventForCause, relatedCache } = useRootCauses();
const { sourceStats, handleSourceMapFiles, applySourceToCauses } = useSourceMap();
const { buildReport: buildReportObj, fallbackReport, buildMarkdown, buildCauseText } = useReport();

const networkMonitor = useNetworkMonitor(cdpClient);
const consoleStream = useConsoleStream(cdpClient);
const logcatManager = useLogcat();

let pollTimer = null;

const targetMeta = computed(() => `${config.title || config.targetId} · ${shortUrl(config.url)}`);
const hasActivatedDevtools = ref(false);
watch(activePanel, (val) => {
    if (val === 'devtools') {
        setTimeout(() => { hasActivatedDevtools.value = true; }, 100);
    }
}, { immediate: true });
const devtoolsUrl = computed(() => {
    if (!hasActivatedDevtools.value) return '';
    const wsUrl = `${location.host}/ws-proxy/${config.port}/devtools/page/${config.targetId}`;
    return `/devtools/inspector.html?ws=${wsUrl}&theme=dark`;
});

const causes = computed(() => report.value?.causes || []);
const breadcrumbs = computed(() => report.value?.breadcrumbs || []);
const selectedCause = computed(() =>
    causes.value.find(c => c.id === selectedCauseId.value) || causes.value[0] || null
);

const counts = computed(() => {
    const c = causes.value;
    const byKind = kind => c.filter(item => item.kind === kind).length;
    return {
        causes: c.length,
        js: byKind('js') + byKind('vue') + byKind('low-signal'),
        network: byKind('network'),
        resource: byKind('resource'),
        bridge: byKind('bridge'),
        source: sourceStats.matched,
        timeline: breadcrumbs.value.length,
        logcat: logcatManager.entries.value.length
    };
});

function setStatus(text, type = '') {
    statusText.value = text;
    statusType.value = type;
}

async function evaluateForCause(expression) {
    const result = await cdpClient.send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true, timeout: 5000
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
    return result.result?.value;
}

function allRawEvents() {
    return [
        ...cdpClient.events.value,
        ...(probe.errors || []).map(item => ({ ...item, source: item.source || 'probe' })),
        ...(probe.network || []).map(item => ({ ...item, type: 'network', source: item.source || 'probe' }))
    ];
}

function renderReport() {
    const rawEvents = allRawEvents();
    const events = dedupeEvents(rawEvents.map(normalizeEventForCause));
    const bc = buildBreadcrumbs(probe.breadcrumbs, events);
    const causesList = buildRootCauses(rawEvents, snapshot.value, config.url, profile.value.id, bc);
    applySourceToCauses(causesList);
    report.value = buildReportObj({
        config, profile: profile.value, snapshot: snapshot.value,
        events, causes: causesList, breadcrumbs: bc, sourceStats,
        logcat: logcatManager.entries.value.map(e => e.raw)
    });
    if (!selectedCauseId.value && causesList[0]) selectedCauseId.value = causesList[0].id;
}

async function collect({ reconnect }) {
    setStatus('采集中', 'busy');
    try {
        if (reconnect || !cdpClient.connected.value) {
            cdpClient.close();
            await cdpClient.connect();
            await cdpClient.enable();
            
            // Set up rrweb transport binding
            await cdpClient.send('Runtime.addBinding', { name: '__rrweb_emit' });
            cdpClient.onEvent('Runtime.bindingCalled', (params) => {
                if (params.name === '__rrweb_emit' && window.electronAPI) {
                    window.electronAPI.saveRrwebChunk(config.targetId, params.payload);
                }
            });

            networkMonitor.setup();
            consoleStream.setup();
        }
        await injectProbe();
        await delay(700);
        const probeData = await pollProbe();
        if (probeData) Object.assign(probe, probeData);
        snapshot.value = await cdpClient.evaluate(runtimeSnapshotExpression());
        profile.value = identifyProject(config.url, snapshot.value, allRawEvents());
        logcatManager.startStream(config.deviceId);
        renderReport();
        setStatus('监听中', '');
        setupAutoReinject(() => {
            setStatus('探针已重注入', 'busy');
            setTimeout(() => setStatus('监听中', ''), 1500);
        });
    } catch (error) {
        setStatus('连接异常', 'error');
        report.value = fallbackReport(config, profile.value, error);
    }
}

async function doPoll() {
    if (!cdpClient.connected.value) return;
    try {
        const probeData = await pollProbe();
        if (probeData) {
            Object.assign(probe, probeData);
            renderReport();
        }
    } catch (e) { /* ignore */ }
}

function onRefresh() {
    relatedCache.clear();
    collect({ reconnect: false });
}
function onOpenDevtools() { 
    const wsUrl = `${location.host}/ws-proxy/${config.port}/devtools/page/${config.targetId}`;
    const realUrl = `/devtools/inspector.html?ws=${wsUrl}&theme=dark`;
    window.open(realUrl, '_blank'); 
}
async function onCopyMarkdown() {
    await navigator.clipboard.writeText(buildMarkdown(report.value) || '');
    setStatus('报告已复制', '');
    setTimeout(() => setStatus('监听中', ''), 1200);
}
async function onCopyCause() {
    await navigator.clipboard.writeText(buildCauseText(selectedCause.value, report.value));
    setStatus('定位信息已复制', '');
    setTimeout(() => setStatus('监听中', ''), 1200);
}
function onSelectCause(id) {
    selectedCauseId.value = id;
    diagnosisOpen.value = true;
    activePanel.value = 'diagnosis';
}
async function onSourceMapUpload(event) {
    const result = await handleSourceMapFiles(event.target.files);
    if (result.error) { setStatus('未选择 map', 'error'); return; }
    renderReport();
    setStatus(`已上传 ${result.count} 个 map`, '');
}

onMounted(async () => {
    if (!config.port || !config.targetId) {
        setStatus('参数缺失', 'error');
        return;
    }
    await collect({ reconnect: true });
    pollTimer = setInterval(doPoll, 1800);
});

onBeforeUnmount(() => {
    clearInterval(pollTimer);
    cdpClient.removeAllListeners();
    cdpClient.close();
    logcatManager.stopStream(config.deviceId);
});
</script>

<template>
    <div class="root-workbench">
        <header class="root-topbar">
            <div class="target-title">
                <strong>ztools</strong>
                <span>{{ targetMeta }}</span>
            </div>

            <div class="h-tools">
                <button class="btn ghost text-accent border border-accent hover:bg-accent hover:bg-opacity-10 shadow-sm" type="button" @click="showRrwebModal = true">🎥 场景回放</button>
                <label class="btn secondary upload-btn" title="上传 .map 文件或选择 dist 目录">
                    上传 SourceMap
                    <input type="file" multiple webkitdirectory accept=".map,application/json" @change="onSourceMapUpload">
                </label>
                <button class="btn secondary" type="button" @click="onCopyMarkdown">复制报告</button>
                <button class="btn ghost" type="button" @click="onOpenDevtools">独立 DevTools</button>
                <span class="status-badge" :class="statusType">{{ statusText }}</span>
            </div>
        </header>

        <div class="workbench-main">
            <RailNav
                :active-panel="activePanel"
                :counts="counts"
                :diagnosis-open="diagnosisOpen"
                @select-panel="activePanel = $event"
                @toggle-diagnosis="diagnosisOpen = !diagnosisOpen"
            />
            <section class="panel-stage">
                <div class="panel-area">
                    <NetworkPanel
                        v-show="activePanel === 'network'"
                        :requests="networkMonitor.filteredRequests.value"
                        :stats="networkMonitor.stats.value"
                        :filter-type="networkMonitor.filterType.value"
                        :search-text="networkMonitor.searchText.value"
                        :paused="networkMonitor.paused.value"
                        :on-fetch-body="networkMonitor.fetchResponseBody"
                        @update:filter-type="networkMonitor.filterType.value = $event"
                        @update:search-text="networkMonitor.searchText.value = $event"
                        @toggle-pause="networkMonitor.togglePause()"
                        @clear="networkMonitor.clear()"
                    />
                    <ConsolePanel
                        v-show="activePanel === 'console'"
                        :entries="consoleStream.filteredEntries.value"
                        :stats="consoleStream.stats.value"
                        :filter-level="consoleStream.filterLevel.value"
                        :search-text="consoleStream.searchText.value"
                        :paused="consoleStream.paused.value"
                        :level-labels="consoleStream.LEVEL_LABELS"
                        :on-execute="consoleStream.execute"
                        @update:filter-level="consoleStream.filterLevel.value = $event"
                        @update:search-text="consoleStream.searchText.value = $event"
                        @toggle-pause="consoleStream.togglePause()"
                        @clear="consoleStream.clear()"
                    />
                    <DevToolsFrame
                        :class="{ 'off-screen': activePanel !== 'devtools' }"
                        :src="devtoolsUrl"
                    />
                    <LogcatView
                        v-show="activePanel === 'logs'"
                        :entries="logcatManager.entries.value"
                        :filtered-entries="logcatManager.filteredEntries.value"
                        :search-text="logcatManager.searchText.value"
                        :filter-level="logcatManager.filterLevel.value"
                        :paused="logcatManager.paused.value"
                        :auto-scroll="logcatManager.autoScroll.value"
                        :match-index="logcatManager.matchIndex.value"
                        :match-count="logcatManager.matchCount.value"
                        :loading="logcatManager.loading.value"
                        :error="logcatManager.error.value"
                        :level-labels="logcatManager.LEVEL_LABELS"
                        @update:search-text="logcatManager.searchText.value = $event"
                        @update:filter-level="logcatManager.filterLevel.value = $event"
                        @toggle-pause="logcatManager.togglePause()"
                        @toggle-auto-scroll="logcatManager.toggleAutoScroll()"
                        @clear="logcatManager.clear()"
                        @next-match="logcatManager.nextMatch()"
                        @prev-match="logcatManager.prevMatch()"
                        @refresh="logcatManager.startStream(config.deviceId)"
                    />
                    <DeviceInfoPanel
                        v-show="activePanel === 'device'"
                        :config="config"
                        :snapshot="snapshot"
                        :profile="profile"
                        :connected="cdpClient.connected.value"
                    />
                    <DetailDrawer
                        v-show="activePanel === 'diagnosis'"
                        :open="diagnosisOpen"
                        :cause="selectedCause"
                        :causes="causes"
                        :report="report"
                        :active-view="'causes'"
                        :breadcrumbs="breadcrumbs"
                        :logcat-lines="logcatManager.entries.value"
                        :source-stats="sourceStats"
                        :on-evaluate="evaluateForCause"
                        @toggle="diagnosisOpen = !diagnosisOpen"
                        @refresh="onRefresh"
                        @copy-cause="onCopyCause"
                        @select-cause="onSelectCause"
                    />
                </div>
            </section>
        </div>
        <RrwebPlayerModal 
            v-if="showRrwebModal" 
            :target-id="config.targetId" 
            :on-close="() => showRrwebModal = false" 
        />
    </div>
</template>

<style scoped>
.off-screen { position: absolute !important; left: -9999px !important; visibility: hidden !important; pointer-events: none !important; }
</style>
