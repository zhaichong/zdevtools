<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import 'rrweb-player/dist/style.css';
import rrwebPlayer from 'rrweb-player';

const props = defineProps({
    targetId: { type: String, required: true },
    onClose: { type: Function, required: true }
});

const shellRef = ref(null);
const playerContainer = ref(null);
const isLoading = ref(false);
const errorMsg = ref('');
const events = ref([]);
let player = null;

const metaEvent = computed(() => events.value.find(event => event?.type === 4));
const fullSnapshotCount = computed(() => events.value.filter(event => event?.type === 2).length);
const durationText = computed(() => {
    if (events.value.length < 2) return '0s';
    const start = events.value[0].timestamp || 0;
    const end = events.value[events.value.length - 1].timestamp || start;
    return `${Math.max(0, Math.round((end - start) / 1000))}s`;
});

function latestReplaySession(chunks) {
    const list = Array.isArray(chunks) ? chunks.filter(event => event?.timestamp) : [];
    let lastFullSnapshot = -1;
    for (let i = list.length - 1; i >= 0; i -= 1) {
        if (list[i]?.type === 2) {
            lastFullSnapshot = i;
            break;
        }
    }
    if (lastFullSnapshot < 0) return list;

    for (let i = lastFullSnapshot; i >= 0; i -= 1) {
        if (list[i]?.type === 4) return list.slice(i);
    }
    return list.slice(lastFullSnapshot);
}

function destroyPlayer() {
    if (player?.$destroy) player.$destroy();
    player = null;
    if (playerContainer.value) playerContainer.value.innerHTML = '';
}

function playerSize() {
    const shell = shellRef.value?.getBoundingClientRect();
    const sourceWidth = metaEvent.value?.data?.width || 390;
    const sourceHeight = metaEvent.value?.data?.height || 780;
    const maxWidth = Math.max(720, (shell?.width || 1120) - 72);
    const maxHeight = Math.max(460, (shell?.height || 760) - 170);
    const controlsHeight = 80;
    const scale = Math.min(maxWidth / sourceWidth, (maxHeight - controlsHeight) / sourceHeight, 1.2);
    return {
        width: Math.round(sourceWidth * scale),
        height: Math.round(sourceHeight * scale + controlsHeight)
    };
}

async function loadReplay() {
    destroyPlayer();
    errorMsg.value = '';
    events.value = [];
    isLoading.value = true;

    try {
        if (!window.electronAPI?.loadRrwebChunks) {
            throw new Error('当前环境没有可用的 Electron 回放接口，请在打包后的应用中使用。');
        }

        const chunks = await window.electronAPI.loadRrwebChunks(props.targetId);
        events.value = latestReplaySession(chunks);

        if (events.value.length < 2) {
            throw new Error('还没有足够的回放数据。请先复现一次问题，再打开回放。');
        }
        if (!fullSnapshotCount.value) {
            throw new Error('回放数据不完整，缺少页面快照。请刷新目标 WebView 后重新复现。');
        }

        isLoading.value = false;
        await nextTick();

        const size = playerSize();
        player = new rrwebPlayer({
            target: playerContainer.value,
            props: {
                events: events.value,
                width: size.width,
                height: size.height,
                autoPlay: true,
                showController: true,
                skipInactive: true
            }
        });
    } catch (error) {
        errorMsg.value = error.message || String(error);
        isLoading.value = false;
    }
}

onMounted(loadReplay);
onBeforeUnmount(destroyPlayer);
</script>

<template>
    <div class="fixed inset-0 z-50 grid place-items-center p-6 bg-zinc-950/25 backdrop-blur-xs select-none" role="dialog" aria-modal="true" aria-label="场景回放">
        <div ref="shellRef" class="flex flex-col overflow-hidden border border-zinc-200 rounded-xl bg-white shadow-lg w-full max-w-6xl max-h-[90vh]">
            <!-- Header -->
            <header class="flex-none flex items-center justify-between gap-4 p-4 border-b border-zinc-200 bg-zinc-50/50">
                <div class="flex flex-col">
                    <h3 class="text-xs font-bold text-zinc-800 m-0 flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-violet-600"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        场景操作回放
                    </h3>
                    <p class="text-[10px] text-zinc-400 font-mono mt-1 m-0">事件 {{ events.length }} 条 · 快照 {{ fullSnapshotCount }} 个 · 时长 {{ durationText }}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button class="px-3 py-1.5 text-xs font-semibold rounded border border-zinc-200 text-zinc-650 bg-white hover:bg-zinc-50 hover:text-zinc-950 transition-colors cursor-pointer outline-none flex items-center gap-1.5 shadow-3xs" type="button" @click="loadReplay">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        重新加载
                    </button>
                    <button class="w-8 h-8 grid place-items-center rounded text-zinc-450 hover:bg-zinc-100 hover:text-zinc-850 transition-colors border border-transparent outline-none cursor-pointer" type="button" aria-label="关闭回放" @click="props.onClose">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </header>

            <!-- Body -->
            <main class="flex-1 min-h-0 grid bg-zinc-50/20 relative">
                <div v-if="isLoading" class="absolute inset-0 grid place-content-center justify-items-center gap-3 p-6 text-center z-10">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-violet-600 animate-spin"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                    <strong class="text-xs font-semibold text-zinc-800">正在加载回放数据</strong>
                    <span class="text-[11px] text-zinc-400">从本机 Electron 用户数据目录读取 rrweb 事件。</span>
                </div>

                <div v-else-if="errorMsg" class="absolute inset-0 grid place-content-center justify-items-center gap-3 p-6 text-center z-10 select-text">
                    <div class="w-10 h-10 rounded-xl border border-dashed border-amber-300 bg-amber-50 flex items-center justify-center mb-2 text-amber-600">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    </div>
                    <strong class="text-xs font-semibold text-amber-700">回放暂不可用</strong>
                    <span class="text-[11px] text-zinc-500 max-w-md">{{ errorMsg }}</span>
                    <button class="mt-4 px-3 py-1.5 text-xs font-semibold rounded border border-zinc-200 text-zinc-650 bg-white hover:bg-zinc-50 hover:text-zinc-950 transition-colors cursor-pointer outline-none shadow-3xs" type="button" @click="loadReplay">重试</button>
                </div>

                <div v-show="!isLoading && !errorMsg" class="min-w-0 min-h-0 grid place-items-center overflow-auto p-5 custom-scrollbar select-text">
                    <div ref="playerContainer" class="min-w-0 min-h-0 relative z-0 rrweb-theme-override"></div>
                </div>
            </main>
        </div>
    </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: #d4d4d8;
    border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #a1a1aa;
}

/* rrweb UI overwrites for light mode */
.rrweb-theme-override :deep(.rr-player) {
    float: none;
    border-radius: 8px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
    background: #ffffff;
    border: 1px solid rgba(228, 228, 231, 0.8);
}

.rrweb-theme-override :deep(.rr-player__frame) {
    background: #ffffff;
}

.rrweb-theme-override :deep(.rr-controller) {
    border-top: 1px solid rgba(228, 228, 231, 0.8);
    background: #fafafa;
    color: #18181b;
}

.rrweb-theme-override :deep(.rr-timeline__time) {
    color: #71717a;
}

.rrweb-theme-override :deep(.rr-controller__btns button) {
    color: #18181b;
}
</style>
