<template>
    <div class="app-shell">
        <TopBar :status="status" @refresh="fetchTargets" @restart="restartAdb" />
        <main>
            <section class="workspace">
                <div class="devices-list">
                    <div v-if="!data?.devices?.length" class="empty-state">
                        {{ data ? '未检测到设备。请确认 USB 已连接、已开启 USB 调试，并允许电脑调试。' : '正在扫描设备...' }}
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
import TopBar from './components/TopBar.vue';
import DeviceCard from './components/DeviceCard.vue';

const { data, status, fetchTargets, restartAdb } = useDevices();

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
