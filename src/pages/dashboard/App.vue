<template>
    <div class="app-shell">
        <TopBar :status="status" @refresh="fetchTargets" @restart="restartAdb" />
        <main>
            <section class="workspace">
                <div class="panel">
                    <div class="section-heading">
                        <h2>设备与页面</h2>
                        <p>选择 WebView 后进入调试工作台，直接查看根因、源码定位、接口、Bridge 和时间线。</p>
                    </div>
                    <div class="devices-list">
                        <div v-if="!data?.devices?.length" class="empty-state">
                            {{ data ? '未检测到设备。请确认 USB 已连接、已开启 USB 调试，并允许电脑调试。' : '正在扫描设备...' }}
                        </div>
                        <DeviceCard
                            v-for="device in data?.devices || []"
                            :key="device.id"
                            :device="device"
                            :get-diagnosis="getDiagnosisForTarget"
                            @workbench="openWorkbench"
                            @copy-link="copyNativeLink"
                            @diagnose="runDiagnosis"
                        />
                    </div>
                </div>
                <aside class="panel detail-panel">
                    <div class="section-heading">
                        <h2>诊断详情</h2>
                        <p>进入"调试工作台"持续监听，必要时复制定位报告。</p>
                    </div>
                    <DiagnosisDetail :detail="diagnosisDetail" @workbench="openWorkbench" />
                </aside>
            </section>
        </main>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useDevices } from './composables/useDevices.js';
import { useQuickDiagnosis } from './composables/useQuickDiagnosis.js';
import TopBar from './components/TopBar.vue';
import SummaryGrid from './components/SummaryGrid.vue';
import DiagnosticsPanel from './components/DiagnosticsPanel.vue';
import DeviceCard from './components/DeviceCard.vue';
import DiagnosisDetail from './components/DiagnosisDetail.vue';

const { data, status, diagnostics, devicesTotal, targetsTotal, lastScanTime, fetchTargets, restartAdb } = useDevices();
const { diagnosisDetail, runDiagnosis, getDiagnosisForTarget } = useQuickDiagnosis();

const errorCount = computed(() => {
    let total = 0;
    if (!data.value?.devices) return 0;
    for (const device of data.value.devices) {
        for (const proc of device.processes || []) {
            for (const target of proc.targets || []) {
                if (target.type !== 'page' && target.type !== 'webview') continue;
                const diag = getDiagnosisForTarget(target, proc);
                if (diag) total += diag.summary.errorCount;
            }
        }
    }
    return total;
});

function openWorkbench({ device, proc, target }) {
    const params = new URLSearchParams({
        port: proc.localPort,
        targetId: target.id,
        deviceId: device.id || target.deviceId || '',
        title: target.title || '',
        url: target.url || '',
        model: device.model || ''
    });
    window.open(`/workbench.html?${params}`, '_blank');
}

function copyNativeLink({ proc, target }) {
    const wsUrl = `${location.host}/ws-proxy/${proc.localPort}/devtools/page/${target.id}`;
    navigator.clipboard.writeText(`devtools://devtools/bundled/inspector.html?ws=${wsUrl}`);
}
</script>
