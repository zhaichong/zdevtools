<script setup>
import { ref, reactive, computed, onMounted, toRef } from 'vue';
import { useWorkbenchSession } from './composables/useWorkbenchSession.js';
import { useReport } from './composables/useReport.js';
import RailNav from './components/RailNav.vue';
import DevToolsFrame from './components/DevToolsFrame.vue';
import DetailDrawer from './components/DetailDrawer.vue';
import DeviceInfoPanel from './components/DeviceInfoPanel.vue';
import LogcatView from './components/LogcatView.vue';
import RrwebPlayerModal from './components/RrwebPlayerModal.vue';
import TimelinePanel from './components/TimelinePanel.vue';
import ReplayPanel from './components/ReplayPanel.vue';
import ReportPanel from './components/ReportPanel.vue';

const props = defineProps({
    target: {
        type: Object,
        required: true
    }
});

const emit = defineEmits(['close']);

// Map the target prop to a reactive config object that the rest of the code expects
const config = reactive({
    port: props.target.port,
    targetId: props.target.targetId,
    deviceId: props.target.deviceId || '',
    title: props.target.title || 'Untitled',
    url: props.target.url || '',
    model: props.target.model || '',
    driverType: props.target.driverType || ''
});

const activePanel = ref('diagnosis');
const selectedCauseId = ref('');
const diagnosisOpen = ref(true);
const showRrwebModal = ref(false);
const hasActivatedDevtools = ref(false);
const embeddedDevtoolsOpen = ref(false);

const { buildMarkdown, buildCauseText } = useReport();

const {
    statusText, statusType, report, snapshot, profile, probe,
    cdpClient, logcatManager, diagnosticRun, sourceStats,
    collect, onRefresh, onPanelChange, renderReport, setStatus, handleSourceMapFiles
} = useWorkbenchSession(config);

// 展开 logcatManager/cdpClient/diagnosticRun 中的 ref，模板中无需显式 .value
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
const cdpConnected = toRef(() => cdpClient.connected.value);
const diagnosticRunId = toRef(() => diagnosticRun.runId.value);

function setLogSearchText(value) { logcatManager.searchText.value = value; }
function setLogFilterLevel(value) { logcatManager.filterLevel.value = value; }

function initSelectedCauseId(causesList) {
    if (!selectedCauseId.value && causesList[0]) {
        selectedCauseId.value = causesList[0].id;
    }
}

onMounted(async () => {
    if (!config.port || !config.targetId) {
        setStatus('参数缺失', 'error');
        return;
    }
    await collect({ reconnect: true }, initSelectedCauseId);
});

const devtoolsUrl = computed(() => {
    if (!hasActivatedDevtools.value) return '';
    const wsUrl = `${location.host}/ws-proxy/${config.port}/devtools/page/${config.targetId}`;
    return `/devtools/inspector.html?ws=${wsUrl}&theme=dark`;
});

const causes = computed(() => report.value?.causes || []);
const breadcrumbs = computed(() => report.value?.breadcrumbs || []);
const reportMarkdown = computed(() => buildMarkdown(report.value) || '');
const selectedCause = computed(() =>
    causes.value.find(c => c.id === selectedCauseId.value) || causes.value[0] || null
);

const counts = computed(() => {
        const c = causes.value;
        // 单次 reduce 替代 5 次 filter 遍历
        const kinds = { js: 0, vue: 0, 'low-signal': 0, network: 0, resource: 0, bridge: 0 };
        for (const item of c) {
            if (kinds[item.kind] !== undefined) kinds[item.kind]++;
        }
        return {
            causes: c.length,
            js: kinds.js + kinds.vue + kinds['low-signal'],
            network: kinds.network,
            resource: kinds.resource,
            bridge: kinds.bridge,
            source: sourceStats.matched,
            timeline: breadcrumbs.value.length,
            logcat: logEntries.value.length
        };
    });

async function evaluateForCause(expression) {
    const result = await cdpClient.send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true, timeout: 5000
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
    return result.result?.value;
}

function onActivateEmbeddedDevtools() {
    hasActivatedDevtools.value = true;
    embeddedDevtoolsOpen.value = true;
}
function onSelectPanel(panel) {
    activePanel.value = panel;
    if (panel === 'devtools') onActivateEmbeddedDevtools();
    onPanelChange(panel);
}
async function onCopyMarkdown() {
    await navigator.clipboard.writeText(reportMarkdown.value);
    setStatus('报告已复制', '');
    setTimeout(() => setStatus('监听中', ''), 1200);
}
async function onCopyCause() {
    await navigator.clipboard.writeText(buildCauseText(selectedCause.value, report.value));
    setStatus('定位信息已复制', '');
    setTimeout(() => setStatus('监听中', ''), 1200);
}
async function onExportRun() {
    const text = await diagnosticRun.exportRun();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setStatus('诊断会话已复制', '');
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
    renderReport(initSelectedCauseId);
    setStatus(`已上传 ${result.count} 个 map`, '');
}
</script>

<template>
    <div class="flex flex-col w-full h-full bg-white text-zinc-900">
        <Teleport to="#workbench-actions">
            <label class="cursor-pointer text-xs bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 px-3 py-1.5 rounded-lg transition-all duration-150 shadow-3xs font-semibold" title="上传 .map 文件或选择 dist 目录">
                上传 SourceMap
                <input type="file" class="hidden" multiple webkitdirectory accept=".map,application/json" @change="onSourceMapUpload">
            </label>
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
                        v-if="activePanel === 'devtools' && embeddedDevtoolsOpen"
                        :src="devtoolsUrl"
                    />
                    <TimelinePanel
                        v-show="activePanel === 'timeline'"
                        :items="breadcrumbs"
                        :causes="causes"
                    />
                    <ReplayPanel
                        v-show="activePanel === 'replay'"
                        :breadcrumbs="breadcrumbs"
                        @open-replay="showRrwebModal = true"
                    />
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
                        @refresh="logcatManager.startStream(config.deviceId)"
                    />
                    <DeviceInfoPanel
                        v-show="activePanel === 'device'"
                        :config="config"
                        :snapshot="snapshot"
                        :profile="profile"
                        :connected="cdpConnected"
                    />
                    <ReportPanel
                        v-show="activePanel === 'report'"
                        :report="report"
                        :markdown="reportMarkdown"
                        :run-id="diagnosticRunId"
                        @copy-markdown="onCopyMarkdown"
                        @export-run="onExportRun"
                    />
                    <DetailDrawer
                        v-show="activePanel === 'diagnosis'"
                        :open="diagnosisOpen"
                        :cause="selectedCause"
                        :causes="causes"
                        :report="report"
                        :active-view="'causes'"
                        :breadcrumbs="breadcrumbs"
                        :logcat-lines="logEntries"
                        :source-stats="sourceStats"
                        :on-evaluate="evaluateForCause"
                        @toggle="diagnosisOpen = !diagnosisOpen"
                        @refresh="() => onRefresh(initSelectedCauseId)"
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
</style>
