import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import { useCdpClient } from '@/shared/composables/useCdpClient.js';
import { identifyProject } from '@/shared/composables/useProjectIdentify.js';
import { runtimeSnapshotExpression } from '@/shared/utils/snapshot.js';
import { delay } from '@/shared/utils/format.js';
import { useProbe } from './useProbe.js';
import { useRootCauses } from './useRootCauses.js';
import { useSourceMap } from './useSourceMap.js';
import { useReport } from './useReport.js';
import { useLogcat } from './useLogcat.js';
import { useDiagnosticRun } from './useDiagnosticRun.js';
import { startRepair, verifyRepair } from '@/shared/utils/repair-loop.mjs';

export function useWorkbenchSession(config) {
    const statusText = ref('连接中');
    const statusType = ref('busy');
    const report = ref(null);
    const repairLoop = ref([]);
    const snapshot = ref(null);
    const probe = reactive({ breadcrumbs: [], errors: [], network: [] });
    const profile = ref(identifyProject(config.url));

    const cdpClient = useCdpClient(config.port, config.targetId, {
        includeTime: true,
        wsDebuggerPath: config.wsDebuggerPath,
        proxyToken: () => config.proxyToken
    });
    const { injectProbe, pollProbe, setupAutoReinject, dispose: disposeProbe, cleanupTarget } = useProbe(cdpClient);
    const { buildRootCauses, buildBreadcrumbs, dedupeEvents, normalizeEventForCause, relatedCache } = useRootCauses();
    const { sourceStats, handleSourceMapFiles, applySourceToCauses } = useSourceMap();
    const { buildReport: buildReportObj, fallbackReport } = useReport();

    const logcatManager = useLogcat();
    const diagnosticRun = useDiagnosticRun(config);

    let pollTimer = null;
    let pollInFlight = false;
    let collectInFlight = false;
    let visibilityHandler = null;
    let currentPanel = 'devtools'; // 当前激活的面板，用于域按需启用

    // 跟踪 collect() 中注册的 CDP 事件监听器，防止重复注册导致泄漏
    let rrwebBindingHandler = null;

    // ========== 内部 Helper ==========

    function pauseAllStreams() {
        cdpClient.pause();
        logcatManager.setHidden(true);
    }

    function resumeAllStreams() {
        cdpClient.resume();
        logcatManager.setHidden(false);
    }

    async function reconnectCdp() {
        // 先清理上一轮的事件监听器，防止累积
        if (rrwebBindingHandler) cdpClient.offEvent('Runtime.bindingCalled', rrwebBindingHandler);
        rrwebBindingHandler = null;
        disposeProbe();

        await cdpClient.close();
        if (currentPanel === 'devtools') return false;
        await cdpClient.connect();
        if (currentPanel === 'devtools') {
            await cdpClient.close();
            return false;
        }
        await cdpClient.enable();
        return true;
    }

    async function setupRrwebBindings() {
        try {
            const storageKey = config.key || config.targetId;
            await cdpClient.send('Runtime.addBinding', { name: '__rrweb_emit' });

            rrwebBindingHandler = (params) => {
                if (params.name === '__rrweb_emit' && window.electronAPI) {
                    window.electronAPI.saveRrwebChunk(storageKey, params.payload);
                }
            };
            cdpClient.onEvent('Runtime.bindingCalled', rrwebBindingHandler);
        } catch (e) {
            console.warn('[workbench] Runtime.addBinding not supported or failed, rrweb replay disabled:', e.message);
        }
    }

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

    function renderReport(triggerSelectedCauseIdUpdate, preserveFallbackCauses = false) {
        const rawEvents = allRawEvents();
        const events = dedupeEvents(rawEvents.map(normalizeEventForCause));
        const bc = buildBreadcrumbs(probe.breadcrumbs, events);
        const causesList = buildRootCauses(rawEvents, snapshot.value, config.url, profile.value?.id, bc);
        if (!causesList.length && preserveFallbackCauses) {
            causesList.push(...(report.value?.causes || []).filter(cause => /^diagnostic:/.test(cause.id || '')));
        }
        applySourceToCauses(causesList);
        report.value = buildReportObj({
            config: { ...config },
            profile: profile.value ? { ...profile.value } : null,
            snapshot: snapshot.value,
            events, causes: causesList, breadcrumbs: bc, sourceStats,
            logcat: logcatManager.entries.value.map(e => e.raw),
            diagnosticRunId: diagnosticRun.runId.value
        });
        report.value.repairLoop = repairLoop.value.map(entry => ({ ...entry }));
        
        if (triggerSelectedCauseIdUpdate) {
            triggerSelectedCauseIdUpdate(causesList);
        }
        
        diagnosticRun.persistReport(report.value).catch(error => {
            console.warn('[diagnostic] persist failed:', error);
        });
    }

    async function resumeSessionCollection() {
        const attached = await reconnectCdp();
        if (!attached || currentPanel === 'devtools') return;
        await setupRrwebBindings();
        await injectProbe();
        setupAutoReinject(() => {
            setStatus('探针已重注入', 'busy');
            setTimeout(() => setStatus('监听中', ''), 1500);
        });
        if (currentPanel === 'devtools') {
            await cleanupTarget();
            await cdpClient.close();
            return;
        }
        if (!pollTimer) {
            pollTimer = setInterval(doPoll, 1800);
        }
        setStatus('监听中', '');
    }

    async function collect({ reconnect }, triggerSelectedCauseIdUpdate) {
        if (collectInFlight) return false; // 防止并发 collect 导致状态交错
        collectInFlight = true;
        let phase = 'CDP 连接';
        setStatus('采集中', 'busy');
        try {
            phase = '创建诊断会话';
            const hadRun = Boolean(diagnosticRun.runId.value);
            await diagnosticRun.createRun(profile.value);
            if (!hadRun && diagnosticRun.runId.value) {
                await window.electronAPI?.clearRrwebChunks?.(config.key || config.targetId);
            }
            logcatManager.startStream(config.deviceId, config.driverType);
            if (reconnect || !cdpClient.connected.value) {
                phase = '建立 CDP 诊断与采集通道';
                await resumeSessionCollection();
            } else {
                phase = '注入探针';
                await injectProbe();
                setupAutoReinject(() => {
                    setStatus('探针已重注入', 'busy');
                    setTimeout(() => setStatus('监听中', ''), 1500);
                });
            }
            if (currentPanel === 'devtools') {
                await cleanupTarget();
                await cdpClient.close();
                return true;
            }
            await delay(700);
            phase = '读取探针数据';
            try {
                const probeData = await pollProbe();
                if (probeData) Object.assign(probe, probeData);
            } catch (e) {
                console.warn('[workbench] poll probe warning:', e.message);
            }
            phase = '采集页面快照';
            try {
                snapshot.value = await cdpClient.evaluate(runtimeSnapshotExpression());
            } catch (e) {
                console.warn('[workbench] runtime snapshot warning:', e.message);
                snapshot.value = null;
            }
            profile.value = identifyProject(config.url, snapshot.value, allRawEvents());
            phase = '生成诊断报告';
            renderReport(triggerSelectedCauseIdUpdate);
            setStatus('监听中', '');
            return true;
        } catch (error) {
            setStatus('连接异常', 'error');
            report.value = fallbackReport(config, profile.value, error, phase);
            report.value.logcat = logcatManager.entries.value.map(e => e.raw);
            report.value.repairLoop = repairLoop.value.map(entry => ({ ...entry }));
            diagnosticRun.persistReport(report.value).catch(persistError => {
                console.warn('[diagnostic] persist failed:', persistError);
            });
            return false;
        } finally {
            collectInFlight = false;
        }
    }

    async function doPoll() {
        if (currentPanel === 'devtools' || !cdpClient.connected.value || pollInFlight || collectInFlight) return;
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
        return collect({ reconnect: false }, triggerSelectedCauseIdUpdate);
    }

    function beginRepair(cause) {
        if (!cause?.id) return null;
        const previous = repairLoop.value.find(entry => entry.causeId === cause.id) || null;
        const entry = startRepair(cause, previous);
        repairLoop.value = [...repairLoop.value.filter(item => item.causeId !== cause.id), entry];
        renderReport(undefined, true);
        return entry;
    }

    async function verifyCause(causeId, triggerSelectedCauseIdUpdate) {
        const entry = repairLoop.value.find(item => item.causeId === causeId);
        if (!entry?.baseline || collectInFlight) return null;

        relatedCache.clear();
        repairLoop.value = [...repairLoop.value.filter(item => item.causeId !== causeId), { ...entry, status: 'verifying' }];
        renderReport(undefined, true);
        const collected = await collect({ reconnect: false }, triggerSelectedCauseIdUpdate);
        const latest = repairLoop.value.find(item => item.causeId === causeId) || entry;
        if (!collected) {
            repairLoop.value = [...repairLoop.value.filter(item => item.causeId !== causeId), { ...latest, status: 'repairing' }];
            renderReport(undefined, true);
            return null;
        }

        const lastVerification = verifyRepair(latest.baseline, report.value?.causes, Date.now());
        repairLoop.value = [...repairLoop.value.filter(item => item.causeId !== causeId), { ...latest, status: lastVerification.status, lastVerification }];
        renderReport();
        return lastVerification;
    }

    /**
     * 面板切换时按需启用/禁用 CDP Domain
     * 仅在连接就绪后执行，不影响初次 collect
     */
    async function onPanelChange(panelName) {
        currentPanel = panelName;
        if (panelName === 'devtools') {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            await cleanupTarget();
            await cdpClient.close();
            return;
        }
        if (!cdpClient.connected.value) return;
        try {
            await cdpClient.enableDomainsForPanel(panelName);
        } catch (e) {
            // 失败不影响使用，部分 target 可能不支持某些域
        }
    }

    onMounted(async () => {
        visibilityHandler = () => {
            if (document.hidden) {
                clearInterval(pollTimer);
                pollTimer = null;
                pauseAllStreams();
                // 禁用非必需 CDP Domain，减轻目标 WebView 负载
                cdpClient.disableAllDomains().catch(() => {});
            } else {
                resumeAllStreams();
                if (currentPanel === 'devtools' || !cdpClient.connected.value) return;
                cdpClient.enableDomainsForPanel(currentPanel).catch(() => {});
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
        // 恢复数据流（防止 unmount 时其他组件仍在引用）
        resumeAllStreams();
        if (pollTimer) clearInterval(pollTimer);
        cdpClient.removeAllListeners();
        cleanupTarget().finally(() => cdpClient.close());
        logcatManager.stopStream(config.deviceId, config.driverType);
    });

    return {
        statusText, statusType, report, snapshot, profile, probe,
        cdpClient, logcatManager, diagnosticRun, sourceStats, repairLoop,
        collect, onRefresh, onPanelChange, renderReport, setStatus, handleSourceMapFiles,
        beginRepair, verifyCause
    };
}
