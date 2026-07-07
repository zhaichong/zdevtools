<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
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

const params = new URLSearchParams(location.search);
const config = reactive({
    port: params.get('port'),
    targetId: params.get('targetId'),
    deviceId: params.get('deviceId') || '',
    title: params.get('title') || 'Untitled',
    url: params.get('url') || '',
    model: params.get('model') || '',
    driverType: params.get('driverType') || ''
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
    collect, onRefresh, renderReport, setStatus, handleSourceMapFiles
} = useWorkbenchSession(config);

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
    <div class="root-workbench">
        <header class="root-topbar">
            <div class="target-title">
                <strong>ztools</strong>
            </div>

            <div class="h-tools">
                <label class="btn secondary upload-btn" title="上传 .map 文件或选择 dist 目录">
                    上传 SourceMap
                    <input type="file" multiple webkitdirectory accept=".map,application/json" @change="onSourceMapUpload">
                </label>
                <span class="status-badge" :class="statusType">{{ statusText }}</span>
            </div>
        </header>

        <div class="workbench-main">
            <RailNav
                :active-panel="activePanel"
                :counts="counts"
                @select-panel="onSelectPanel"
            />
            <section class="panel-stage">
                <div class="panel-area">
                    <DevToolsFrame
                        :class="{ 'off-screen': activePanel !== 'devtools' || !embeddedDevtoolsOpen }"
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
                    <ReportPanel
                        v-show="activePanel === 'report'"
                        :report="report"
                        :markdown="reportMarkdown"
                        :run-id="diagnosticRun.runId.value"
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
                        :logcat-lines="logcatManager.entries.value"
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
.off-screen { position: absolute !important; left: -9999px !important; visibility: hidden !important; pointer-events: none !important; }
</style>
