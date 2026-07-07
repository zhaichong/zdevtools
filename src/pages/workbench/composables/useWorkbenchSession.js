import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import { useCdpClient } from '@/shared/composables/useCdpClient.js';
import { identifyProject } from '@/shared/composables/useProjectIdentify.js';
import { runtimeSnapshotExpression } from '@/shared/utils/snapshot.js';
import { delay } from '@/shared/utils/format.js';
import { useProbe } from './useProbe.js';
import { useRootCauses } from './useRootCauses.js';
import { useSourceMap } from './useSourceMap.js';
import { useReport } from './useReport.js';
import { useNetworkMonitor } from './useNetworkMonitor.js';
import { useConsoleStream } from './useConsoleStream.js';
import { useLogcat } from './useLogcat.js';
import { useDiagnosticRun } from './useDiagnosticRun.js';

export function useWorkbenchSession(config) {
    const statusText = ref('连接中');
    const statusType = ref('busy');
    const report = ref(null);
    const snapshot = ref(null);
    const probe = reactive({ breadcrumbs: [], errors: [], network: [] });
    const profile = ref(identifyProject(config.url));

    const cdpClient = useCdpClient(config.port, config.targetId, { includeTime: true });
    const { injectProbe, pollProbe, setupAutoReinject, dispose: disposeProbe } = useProbe(cdpClient);
    const { buildRootCauses, buildBreadcrumbs, dedupeEvents, normalizeEventForCause, relatedCache } = useRootCauses();
    const { sourceStats, handleSourceMapFiles, applySourceToCauses } = useSourceMap();
    const { buildReport: buildReportObj, fallbackReport } = useReport();

    const networkMonitor = useNetworkMonitor(cdpClient);
    const consoleStream = useConsoleStream(cdpClient);
    const logcatManager = useLogcat();
    const diagnosticRun = useDiagnosticRun(config);

    let pollTimer = null;
    let pollInFlight = false;
    let collectInFlight = false;
    let visibilityHandler = null;

    // 跟踪 collect() 中注册的 CDP 事件监听器，防止重复注册导致泄漏
    let rrwebBindingHandler = null;
    let frameNavigatedHandler = null;

    function setStatus(text, type = '') {
        statusText.value = text;
        statusType.value = type;
    }

    function allRawEvents() {
        return [
            ...cdpClient.events.value,
            ...(probe.errors || []).map(item => ({ ...item, source: item.source || 'probe' })),
            ...(probe.network || []).map(item => ({ ...item, type: 'network', source: item.source || 'probe' }))
        ];
    }

    function renderReport(triggerSelectedCauseIdUpdate) {
        const rawEvents = allRawEvents();
        const events = dedupeEvents(rawEvents.map(normalizeEventForCause));
        const bc = buildBreadcrumbs(probe.breadcrumbs, events);
        const causesList = buildRootCauses(rawEvents, snapshot.value, config.url, profile.value?.id, bc);
        applySourceToCauses(causesList);
        report.value = buildReportObj({
            config: { ...config },
            profile: profile.value ? { ...profile.value } : null,
            snapshot: snapshot.value,
            events, causes: causesList, breadcrumbs: bc, sourceStats,
            logcat: logcatManager.entries.value.map(e => e.raw),
            diagnosticRunId: diagnosticRun.runId.value
        });
        
        if (triggerSelectedCauseIdUpdate) {
            triggerSelectedCauseIdUpdate(causesList);
        }
        
        diagnosticRun.persistReport(report.value).catch(error => {
            console.warn('[diagnostic] persist failed:', error);
        });
    }

    async function collect({ reconnect }, triggerSelectedCauseIdUpdate) {
        if (collectInFlight) return; // 防止并发 collect 导致状态交错
        collectInFlight = true;
        let phase = 'CDP 连接';
        setStatus('采集中', 'busy');
        try {
            phase = '创建诊断会话';
            await diagnosticRun.createRun(profile.value);
            logcatManager.startStream(config.deviceId, config.driverType);
            if (reconnect || !cdpClient.connected.value) {
                phase = 'CDP 连接';
                // 先清理上一轮的事件监听器，防止累积
                if (rrwebBindingHandler) cdpClient.offEvent('Runtime.bindingCalled', rrwebBindingHandler);
                if (frameNavigatedHandler) cdpClient.offEvent('Page.frameNavigated', frameNavigatedHandler);
                rrwebBindingHandler = null;
                frameNavigatedHandler = null;
                networkMonitor.dispose();
                consoleStream.dispose();
                disposeProbe();

                cdpClient.close();
                await cdpClient.connect();
                phase = '启用 CDP 域';
                await cdpClient.enable();
                phase = '清理回放缓存';
                await window.electronAPI?.clearRrwebChunks?.(config.targetId);
                
                phase = '绑定回放通道';
                await cdpClient.send('Runtime.addBinding', { name: '__rrweb_emit' });

                // 使用具名函数，便于下次 reconnect 时精确移除
                rrwebBindingHandler = (params) => {
                    if (params.name === '__rrweb_emit' && window.electronAPI) {
                        window.electronAPI.saveRrwebChunk(config.targetId, params.payload);
                    }
                };
                cdpClient.onEvent('Runtime.bindingCalled', rrwebBindingHandler);

                frameNavigatedHandler = (params) => {
                    if (!params.frame.parentId) {
                        networkMonitor.clear();
                        consoleStream.clear();
                    }
                };
                cdpClient.onEvent('Page.frameNavigated', frameNavigatedHandler);

                networkMonitor.setup();
                consoleStream.setup();
            }
            phase = '注入探针';
            await injectProbe();
            await delay(700);
            phase = '读取探针数据';
            const probeData = await pollProbe();
            if (probeData) Object.assign(probe, probeData);
            phase = '采集页面快照';
            snapshot.value = await cdpClient.evaluate(runtimeSnapshotExpression());
            profile.value = identifyProject(config.url, snapshot.value, allRawEvents());
            phase = '生成诊断报告';
            renderReport(triggerSelectedCauseIdUpdate);
            setStatus('监听中', '');
            setupAutoReinject(() => {
                setStatus('探针已重注入', 'busy');
                setTimeout(() => setStatus('监听中', ''), 1500);
            });
        } catch (error) {
            setStatus('连接异常', 'error');
            report.value = fallbackReport(config, profile.value, error, phase);
            report.value.logcat = logcatManager.entries.value.map(e => e.raw);
            diagnosticRun.persistReport(report.value).catch(persistError => {
                console.warn('[diagnostic] persist failed:', persistError);
            });
        } finally {
            collectInFlight = false;
        }
    }

    async function doPoll() {
        if (!cdpClient.connected.value || pollInFlight) return;
        pollInFlight = true;
        try {
            const probeData = await pollProbe();
            if (probeData) {
                Object.assign(probe, probeData);
                renderReport();
            }
        } catch (e) { /* ignore */ }
        finally { pollInFlight = false; }
    }

    function onRefresh(triggerSelectedCauseIdUpdate) {
        relatedCache.clear();
        collect({ reconnect: false }, triggerSelectedCauseIdUpdate);
    }

    onMounted(async () => {
        pollTimer = setInterval(doPoll, 1800);
        
        visibilityHandler = () => {
            if (document.hidden) {
                clearInterval(pollTimer);
                pollTimer = null;
            } else {
                if (!pollTimer) {
                    doPoll();
                    pollTimer = setInterval(doPoll, 1800);
                }
            }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
    });

    onBeforeUnmount(() => {
        if (visibilityHandler) {
            document.removeEventListener('visibilitychange', visibilityHandler);
        }
        if (pollTimer) clearInterval(pollTimer);
        cdpClient.removeAllListeners();
        cdpClient.close();
        logcatManager.stopStream(config.deviceId);
    });

    return {
        statusText, statusType, report, snapshot, profile, probe,
        cdpClient, logcatManager, diagnosticRun, sourceStats,
        collect, onRefresh, renderReport, setStatus, handleSourceMapFiles
    };
}
