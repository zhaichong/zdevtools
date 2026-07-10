<template>
    <div class="flex items-center h-full min-w-0">
        <div class="flex items-center gap-2 shrink-0 mr-4">
            <h2 class="text-sm font-semibold text-zinc-800">可调试目标</h2>
            <span class="w-2 h-2 rounded-full" :class="statusDotClass"></span>
            <button
                type="button"
                @click="$emit('refresh')"
                class="bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-xs text-zinc-700 px-2 py-1 rounded transition-colors"
            >
                刷新
            </button>
            <span v-if="!targets.length" class="text-[10px] text-zinc-500 ml-1">{{ status.text }}</span>
        </div>

        <div class="flex items-center gap-2 overflow-x-auto custom-scrollbar flex-1 min-w-0 h-full py-1">
            <button
                v-for="target in targets"
                :key="`${target.deviceId}:${target.port}:${target.targetId}`"
                type="button"
                @click="$emit('select-target', target)"
                class="group flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors shrink-0 max-w-[320px] cursor-pointer"
                :class="activeTargetId === target.targetId ? 'bg-accent/10 border-accent/40 text-accent-strong' : 'bg-white hover:border-accent/40 border-zinc-200 text-zinc-800'"
                :title="target.url || target.title || target.deviceId"
            >
                <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="activeTargetId === target.targetId ? 'bg-accent' : 'bg-success'"></span>
                <span class="text-xs truncate font-medium">{{ target.title || 'Untitled WebView' }}</span>
                <span class="text-[10px] text-zinc-500 truncate max-w-[100px]">{{ target.model || target.deviceId }}</span>
                <span class="text-[10px] rounded border border-zinc-200 px-1.5 py-0.5 text-zinc-500 uppercase">{{ target.driverType || 'auto' }}</span>
                <span v-if="activeTargetId !== target.targetId" class="text-[10px] font-bold text-zinc-400 group-hover:text-accent transition-colors shrink-0">
                    调试
                </span>
                <span v-else class="text-[10px] font-bold text-accent shrink-0">
                    诊断中
                </span>
            </button>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    targets: {
        type: Array,
        default: () => []
    },
    status: {
        type: Object,
        default: () => ({ text: '初始化中', type: 'busy' })
    },
    activeTargetId: {
        type: String,
        default: null
    }
});

defineEmits(['select-target', 'refresh']);

const statusDotClass = computed(() => {
    if (props.status.type === 'error') return 'bg-danger';
    if (props.status.type === 'busy') return 'bg-warning';
    return props.targets.length ? 'bg-success' : 'bg-warning';
});
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
    height: 4px;
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
</style>
