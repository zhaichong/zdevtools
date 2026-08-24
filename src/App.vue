<template>
    <div class="flex flex-col h-screen w-screen bg-white text-zinc-900 overflow-hidden font-sans text-sm">
        <header class="flex items-center justify-between px-4 py-2 bg-white border-b border-zinc-200 flex-shrink-0 z-20 h-14 select-none">
            <div class="flex items-center gap-2 mr-6 shrink-0">
                <span class="text-xs font-extrabold bg-violet-600 text-white px-2.5 py-0.5 rounded-md tracking-wider font-sans">ztools</span>
                <span v-if="currentVersion" class="text-[10px] text-zinc-400 font-mono bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200">v{{ currentVersion }}</span>
            </div>
            <Sidebar
                class="flex-1 min-w-0 mr-4"
                :targets="targets"
                :status="status"
                :active-target-key="activeTargetKey"
                @select-target="handleSelectTarget"
                @refresh="handleRefresh"
            />
            
            <!-- 在线更新区域 -->
            <div class="flex items-center gap-2 mr-4 shrink-0">
                <!-- 检查中 -->
                <button v-if="updateStatus === 'checking'" class="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 text-xs text-zinc-400 px-2.5 py-1 rounded cursor-not-allowed" disabled type="button">
                    <span class="w-3 h-3 border-2 border-zinc-300 border-t-violet-600 rounded-full animate-spin"></span>
                    <span>检查中...</span>
                </button>

                <!-- 有新版本 -->
                <button v-else-if="updateStatus === 'available'"
                    class="bg-violet-600 hover:bg-violet-700 text-white border border-violet-600 text-xs px-2.5 py-1 rounded transition-colors font-medium cursor-pointer"
                    @click="downloadUpdate" type="button">
                    下载更新 <strong v-if="updateInfo" class="font-bold">v{{ updateInfo.version }}</strong>
                </button>

                <!-- 下载中 + 进度条 -->
                <div v-else-if="updateStatus === 'downloading'" class="flex flex-col gap-1 w-28 mr-2">
                    <div class="flex justify-between text-[10px] text-violet-600 font-medium">
                        <span>下载中</span>
                        <span>{{ downloadProgress.percent }}%</span>
                    </div>
                    <div class="w-full h-1 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200">
                        <div class="h-full bg-violet-600 transition-all duration-200" :style="{ width: downloadProgress.percent + '%' }"></div>
                    </div>
                </div>

                <!-- 下载完成 -->
                <button v-else-if="updateStatus === 'downloaded'"
                    class="bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 text-xs px-2.5 py-1 rounded transition-colors font-medium cursor-pointer"
                    @click="quitAndInstall" type="button">
                    重启安装
                </button>

                <!-- 已是最新 -->
                <button v-else-if="updateStatus === 'not-available'" class="bg-zinc-50 border border-zinc-200 text-zinc-400 text-xs px-2.5 py-1 rounded cursor-default font-medium" disabled type="button">
                    ✓ 已是最新
                </button>

                <!-- 出错 -->
                <template v-else-if="updateStatus === 'error'">
                    <button class="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs px-2.5 py-1 rounded transition-colors font-medium cursor-pointer"
                        @click="checkForUpdates" type="button"
                        :title="'更新出错：' + (errorMessage || '未知错误') + ' — 点击重试'">
                        ⚠ 更新失败
                    </button>
                    <button class="bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-700 text-xs px-2.5 py-1 rounded transition-colors font-medium cursor-pointer"
                        @click="installLocalPackage" type="button"
                        title="从本地选择已下载的新版本 .exe 安装包直接执行升级">
                        本地升级
                    </button>
                </template>

                <!-- 默认 idle：检查更新 -->
                <button v-else class="bg-white hover:bg-zinc-50 border border-zinc-200 text-xs text-zinc-600 px-2.5 py-1 rounded transition-colors font-medium cursor-pointer" @click="checkForUpdates" type="button">
                    检查更新
                </button>
            </div>

            <div id="workbench-actions" class="flex items-center space-x-3 shrink-0"></div>
        </header>

        <main class="flex-1 relative overflow-hidden bg-zinc-50">
            <Transition name="fade" mode="out-in">
                <WorkbenchView
                    v-if="activeTarget"
                    :key="activeTarget.key"
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
import { useUpdate } from './composables/useUpdate.js';

const { data, status, diagnostics, devicesTotal, targetsTotal, fetchTargets } = useDevices();
const activeTarget = ref(null);
const activeTargetKey = ref(null);
const closedTargetKey = ref(null);

const {
    updateStatus,
    downloadProgress,
    updateInfo,
    errorMessage,
    currentVersion,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    installLocalPackage
} = useUpdate();

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
    if (activeTarget.value) {
        const stillExists = items.some(t => t.key === activeTargetKey.value);
        if (!stillExists) {
            closeWorkbench();
        }
        return;
    }
    
    if (items.length > 0) {
        const target = items.find(t => t.key !== closedTargetKey.value);
        if (target) {
            handleSelectTarget(target);
        }
    }
}, { immediate: true });

function toTargetInfo(device, proc, target) {
    let wsDebuggerPath = '';
    if (target.webSocketDebuggerUrl) {
        try {
            const parsed = new URL(target.webSocketDebuggerUrl);
            const p = parsed.pathname + parsed.search;
            // 严格白名单校验：仅接受 /devtools/page/ 开头的页面级调试路径，拒绝 /devtools/browser 等提权端点
            if (/^\/devtools\/page\/[A-Za-z0-9_.:\-@%]+(?:\?[A-Za-z0-9_.:\-@%&=~+#]*)?$/i.test(p)) {
                wsDebuggerPath = p;
            }
        } catch (e) {}
    }
    const driverType = device.driver || '';
    const deviceId = device.id || target.deviceId || '';
    const port = proc.localPort;
    const targetId = target.id;
    const key = `${driverType}:${deviceId}:${port}:${targetId}`;

    return {
        key, // 稳定唯一的复合主键，防止同 targetId 串会话
        port,
        targetId,
        wsDebuggerPath: wsDebuggerPath || `/devtools/page/${targetId}`,
        deviceId,
        driverType,
        title: target.title || '',
        url: target.url || '',
        model: device.model || '',
        processName: proc.processName || target.processName || ''
    };
}

function handleSelectTarget(targetInfo) {
    closedTargetKey.value = null;
    activeTarget.value = targetInfo;
    activeTargetKey.value = targetInfo.key;
}

function handleRefresh() {
    closedTargetKey.value = null;
    fetchTargets();
}

function closeWorkbench() {
    closedTargetKey.value = activeTargetKey.value;
    activeTarget.value = null;
    activeTargetKey.value = null;
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
