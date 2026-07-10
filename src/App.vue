<template>
    <div class="flex flex-col h-screen w-screen bg-zinc-50 text-zinc-900 overflow-hidden font-sans text-sm">
        <header class="flex items-center justify-between px-4 py-2 bg-white border-b border-zinc-200 flex-shrink-0 z-20 h-14">
            <Sidebar
                class="flex-1 min-w-0 mr-4"
                :targets="targets"
                :status="status"
                :active-target-id="activeTargetId"
                @select-target="handleSelectTarget"
                @refresh="fetchTargets"
            />
            <div id="workbench-actions" class="flex items-center space-x-3 shrink-0"></div>
        </header>

        <main class="flex-1 relative overflow-hidden bg-zinc-50">
            <Transition name="fade" mode="out-in">
                <WorkbenchView
                    v-if="activeTarget"
                    :key="activeTarget.targetId"
                    :target="activeTarget"
                    @close="closeWorkbench"
                />
                <WelcomeScreen
                    v-else
                    :status="status"
                    :devices-total="devicesTotal"
                    :targets-total="targetsTotal"
                    :diagnostics="diagnostics"
                />
            </Transition>
        </main>
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Sidebar from './components/Sidebar.vue';
import WelcomeScreen from './components/WelcomeScreen.vue';
import WorkbenchView from './pages/workbench/WorkbenchView.vue';
import { useDevices } from './composables/useDevices.js';

const { data, status, diagnostics, devicesTotal, targetsTotal, fetchTargets } = useDevices();
const activeTarget = ref(null);
const activeTargetId = ref(null);
const closedTargetId = ref(null);

const targets = computed(() => {
    const items = [];
    for (const device of data.value?.devices || []) {
        for (const proc of device.processes || []) {
            for (const target of proc.targets || []) {
                items.push(toTargetInfo(device, proc, target));
            }
        }
    }
    return items;
});

watch(targets, (items) => {
    if (activeTarget.value || items.length !== 1) return;
    const [target] = items;
    if (target.targetId === closedTargetId.value) return;
    handleSelectTarget(target);
});

function toTargetInfo(device, proc, target) {
    return {
        port: proc.localPort,
        targetId: target.id,
        deviceId: device.id || target.deviceId || '',
        driverType: device.driver || '',
        title: target.title || '',
        url: target.url || '',
        model: device.model || '',
        processName: proc.processName || target.processName || ''
    };
}

function handleSelectTarget(targetInfo) {
    closedTargetId.value = null;
    activeTarget.value = targetInfo;
    activeTargetId.value = targetInfo.targetId;
}

function closeWorkbench() {
    closedTargetId.value = activeTargetId.value;
    activeTarget.value = null;
    activeTargetId.value = null;
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: scale(0.99);
}
</style>
