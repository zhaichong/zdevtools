<template>
    <div class="flex items-center h-full min-w-0">
        <div class="flex items-center gap-2 shrink-0 mr-4 border-r border-zinc-200 pr-4">
            <h2 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">可调试目标</h2>
            <span class="w-2 h-2 rounded-full" :class="statusDotClass"></span>
            <button
                type="button"
                @click="$emit('refresh')"
                class="bg-white hover:bg-zinc-50 border border-zinc-200 text-xs text-zinc-600 px-2.5 py-1 rounded transition-colors font-medium cursor-pointer"
            >
                刷新
            </button>
            <span v-if="!targets.length" class="text-[10px] text-zinc-400 ml-1">{{ status.text }}</span>
        </div>

        <!-- 下拉设备选择器 -->
        <div class="relative shrink-0" ref="dropdownRef">
            <button
                type="button"
                @click="isOpen = !isOpen"
                class="bg-white hover:bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 px-3 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors font-medium select-none shadow-3xs"
            >
                <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="activeTarget ? 'bg-success' : 'bg-warning'"></span>
                <span class="max-w-[180px] truncate text-left">
                    {{ activeTarget ? (activeTarget.title || '未命名 WebView') : '选择调试目标' }}
                </span>
                <span v-if="activeTarget" class="text-[10px] text-zinc-400 font-normal shrink-0">({{ activeTarget.model || activeTarget.deviceId }})</span>
                <svg class="w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0" :class="{ 'rotate-180': isOpen }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
            </button>

            <!-- 下拉菜单列表 -->
            <div
                v-if="isOpen"
                class="absolute left-0 mt-1.5 w-80 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-50 overflow-hidden flex flex-col font-sans"
            >
                <div class="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-100 flex justify-between items-center bg-zinc-50 select-none">
                    <span>可用目标列表 ({{ targets.length }})</span>
                    <span v-if="status.type === 'busy'" class="w-3 h-3 border-2 border-zinc-200 border-t-violet-600 rounded-full animate-spin"></span>
                </div>
                
                <div class="max-h-64 overflow-y-auto custom-scrollbar py-0.5">
                    <button
                        v-for="target in targets"
                        :key="`${target.deviceId}:${target.port}:${target.targetId}`"
                        type="button"
                        @click="selectTarget(target)"
                        class="w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-zinc-50 transition-colors cursor-pointer group"
                    >
                        <span class="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" :class="activeTargetId === target.targetId ? 'bg-violet-600 animate-pulse' : 'bg-zinc-300'"></span>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-1.5 justify-between">
                                <span class="font-medium text-xs truncate" :class="activeTargetId === target.targetId ? 'text-violet-700 font-semibold' : 'text-zinc-800'">
                                    {{ target.title || '未命名 WebView' }}
                                </span>
                                <span class="text-[9px] rounded border px-1.5 py-0.2 uppercase font-semibold scale-90 shrink-0" :class="activeTargetId === target.targetId ? 'border-violet-200 bg-violet-100/50 text-violet-700' : 'bg-zinc-100 text-zinc-500 border-zinc-200'">
                                    {{ target.driverType || 'auto' }}
                                </span>
                            </div>
                            <div class="text-[10px] text-zinc-400 truncate mt-0.5 flex justify-between">
                                <span>{{ target.model || target.deviceId }}</span>
                                <span v-if="activeTargetId === target.targetId" class="text-violet-600 font-bold shrink-0">诊断中</span>
                                <span v-else class="text-zinc-300 group-hover:text-violet-500 transition-colors font-medium shrink-0">点击调试</span>
                            </div>
                        </div>
                    </button>
                    
                    <div v-if="!targets.length" class="px-3 py-6 text-center text-zinc-400 text-xs">
                        未检测到任何 WebView 目标
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';

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

const emit = defineEmits(['select-target', 'refresh']);

const isOpen = ref(false);
const dropdownRef = ref(null);

const activeTarget = computed(() => {
    return props.targets.find(t => t.targetId === props.activeTargetId) || null;
});

const statusDotClass = computed(() => {
    if (props.status.type === 'error') return 'bg-danger';
    if (props.status.type === 'busy') return 'bg-warning';
    return props.targets.length ? 'bg-success' : 'bg-warning';
});

function selectTarget(target) {
    emit('select-target', target);
    isOpen.value = false;
}

function handleClickOutside(event) {
    if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
        isOpen.value = false;
    }
}

onMounted(() => {
    window.addEventListener('click', handleClickOutside, true);
});

onUnmounted(() => {
    window.removeEventListener('click', handleClickOutside, true);
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
