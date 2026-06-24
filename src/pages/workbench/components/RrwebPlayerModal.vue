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
    <div class="replay-modal-backdrop" role="dialog" aria-modal="true" aria-label="场景回放">
        <div ref="shellRef" class="replay-modal">
            <header class="replay-modal-header">
                <div>
                    <h3>场景回放</h3>
                    <p>事件 {{ events.length }} 条 · 快照 {{ fullSnapshotCount }} 个 · 时长 {{ durationText }}</p>
                </div>
                <div class="replay-modal-actions">
                    <button class="replay-ghost-btn" type="button" @click="loadReplay">重新加载</button>
                    <button class="replay-close-btn" type="button" aria-label="关闭回放" @click="props.onClose">×</button>
                </div>
            </header>

            <main class="replay-modal-body">
                <div v-if="isLoading" class="replay-state">
                    <strong>正在加载回放数据</strong>
                    <span>从本机 Electron 用户数据目录读取 rrweb 事件。</span>
                </div>

                <div v-else-if="errorMsg" class="replay-state replay-error">
                    <strong>回放暂不可用</strong>
                    <span>{{ errorMsg }}</span>
                    <button class="btn primary" type="button" @click="loadReplay">重试</button>
                </div>

                <div v-show="!isLoading && !errorMsg" class="replay-stage-wrap">
                    <div ref="playerContainer" class="replay-player"></div>
                </div>
            </main>
        </div>
    </div>
</template>

<style scoped>
.replay-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(15, 23, 42, 0.78);
}

.replay-modal {
    width: min(1180px, calc(100vw - 48px));
    height: min(820px, calc(100vh - 48px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid #d7dde8;
    border-radius: 8px;
    background: #f8fafc;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.38);
}

.replay-modal-header {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    border-bottom: 1px solid #d7dde8;
    background: #fff;
}

.replay-modal-header h3 {
    margin: 0;
    color: #111827;
    font-size: 16px;
}

.replay-modal-header p {
    margin: 4px 0 0;
    color: #5f6b7a;
    font-size: 12px;
}

.replay-modal-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.replay-ghost-btn,
.replay-close-btn {
    border: 1px solid #d7dde8;
    border-radius: 8px;
    background: #fff;
    color: #111827;
    cursor: pointer;
}

.replay-ghost-btn {
    padding: 7px 10px;
    font-size: 12px;
}

.replay-close-btn {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    font-size: 22px;
    line-height: 1;
}

.replay-ghost-btn:hover,
.replay-close-btn:hover {
    border-color: #2563eb;
    color: #2563eb;
}

.replay-modal-body {
    flex: 1;
    min-height: 0;
    display: grid;
    background: #0f172a;
}

.replay-stage-wrap {
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: center;
    overflow: auto;
    padding: 20px;
}

.replay-player {
    min-width: 0;
    min-height: 0;
}

.replay-state {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 10px;
    padding: 24px;
    color: #cbd5e1;
    text-align: center;
}

.replay-state strong {
    color: #fff;
    font-size: 15px;
}

.replay-error {
    color: #fbbf24;
}

:deep(.rr-player) {
    float: none;
    border-radius: 8px;
    box-shadow: none;
}

:deep(.rr-player__frame) {
    background: #fff;
}

:deep(.rr-controller) {
    border-top: 1px solid #e5e7eb;
}
</style>
