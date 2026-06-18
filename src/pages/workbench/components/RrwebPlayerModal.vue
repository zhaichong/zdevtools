<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import 'rrweb-player/dist/style.css';
import rrwebPlayer from 'rrweb-player';

const props = defineProps({
    targetId: { type: String, required: true },
    onClose: { type: Function, required: true }
});

const playerContainer = ref(null);
const isLoading = ref(true);
const errorMsg = ref('');
let player = null;

onMounted(async () => {
    try {
        const chunks = await window.electronAPI.loadRrwebChunks(props.targetId);
        if (!chunks || chunks.length < 2) {
            errorMsg.value = '没有足够的录像数据 (录像功能需要至少产生 2 个 DOM 节点变化事件)。';
            isLoading.value = false;
            return;
        }

        isLoading.value = false;
        await nextTick();
        
        player = new rrwebPlayer({
            target: playerContainer.value,
            props: {
                events: chunks,
                width: 800,
                height: 600,
                autoPlay: true,
            }
        });
    } catch (e) {
        errorMsg.value = '加载回放失败: ' + e.message;
        isLoading.value = false;
    }
});

onBeforeUnmount(() => {
    if (player) {
        player = null;
    }
});
</script>

<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 backdrop-blur-sm">
        <div class="bg-panel rounded-lg shadow-2xl flex flex-col overflow-hidden" style="width: 840px; height: 700px;">
            <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-panel-strong">
                <h3 class="text-text font-bold text-lg">📸 崩溃现场回放</h3>
                <button @click="props.onClose" class="text-muted hover:text-text focus:outline-none">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="flex-1 flex items-center justify-center relative bg-bg-base overflow-hidden">
                <div v-if="isLoading" class="text-accent animate-pulse">正在加载回放数据...</div>
                <div v-else-if="errorMsg" class="text-danger">{{ errorMsg }}</div>
                <div v-else ref="playerContainer" class="w-full h-full flex items-center justify-center"></div>
            </div>
        </div>
    </div>
</template>
