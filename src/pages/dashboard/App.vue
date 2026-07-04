<template>
    <div class="app-shell">
        <TopBar
            :status="status"
            :update-status="updateStatus"
            :download-progress="downloadProgress"
            :update-info="updateInfo"
            :update-error-message="errorMessage"
            :current-version="currentVersion"
            @refresh="fetchTargets"
            @restart="restartAdb"
            @check-update="checkForUpdates"
            @download-update="downloadUpdate"
            @quit-install="quitAndInstall"
        />

        <main class="dashboard-main">
            <section class="workspace">
                <header class="scan-bar">
                    <div class="scan-title">
                        <h2>可调试目标</h2>
                        <p>{{ devicesTotal }} 台设备 · {{ targetsTotal }} 个 WebView · 最近 {{ lastScanTime }}</p>
                    </div>
                    <div class="scan-chips">
                        <span class="scan-chip good">ADB 正常</span>
                        <span class="scan-chip" :class="targetsTotal ? 'good' : 'warn'">
                            {{ targetsTotal ? 'WebView 调试已开启' : '未发现 WebView' }}
                        </span>
                        <span class="scan-chip" :class="errorCount ? 'warn' : 'good'">
                            {{ errorCount ? `${errorCount} 条提示` : '无异常' }}
                        </span>
                    </div>
                    <div class="scan-actions">
                        <button class="btn secondary" type="button" @click="fetchTargets">重新扫描</button>
                        <button class="btn ghost" type="button" @click="restartAdb">重启 ADB</button>
                    </div>
                </header>

                <div class="devices-list">
                    <div v-if="!data?.devices?.length" class="empty-state">
                        <strong>{{ data ? '未检测到设备' : '正在扫描设备' }}</strong>
                        <span>{{ data ? '连接 USB，开启 USB 调试，并在手机上允许此电脑调试。' : '正在通过 ADB 查找可调试 WebView。' }}</span>
                    </div>
                    <DeviceCard
                        v-for="device in data?.devices || []"
                        :key="device.id"
                        :device="device"
                        @workbench="openWorkbench"
                    />
                </div>
            </section>
        </main>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useDevices } from './composables/useDevices.js';
import { useUpdate } from './composables/useUpdate.js';
import TopBar from './components/TopBar.vue';
import DeviceCard from './components/DeviceCard.vue';

const { data, status, diagnostics, devicesTotal, targetsTotal, lastScanTime, fetchTargets, restartAdb } = useDevices();
const errorCount = computed(() => diagnostics.value.filter(item => item.isError).length);

const {
    updateStatus,
    downloadProgress,
    updateInfo,
    errorMessage,
    currentVersion,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall
} = useUpdate();

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
</script>
