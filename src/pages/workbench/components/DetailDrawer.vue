
<script setup>
import { ref, computed } from 'vue';
import { formatTime } from '@/shared/utils/format.js';
import CauseDetail from './CauseDetail.vue';

const sidebarWidth = ref(288);
const startX = ref(0);
const startWidth = ref(0);

function startDrag(e) {
    startX.value = e.clientX;
    startWidth.value = sidebarWidth.value;
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
}

function doDrag(e) {
    let newWidth = startWidth.value + (e.clientX - startX.value);
    if (newWidth < 200) newWidth = 200;
    if (newWidth > 800) newWidth = 800;
    sidebarWidth.value = newWidth;
}

function stopDrag() {
    document.removeEventListener('mousemove', doDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
}

const props = defineProps({
    cause: { type: Object, default: null },
    causes: { type: Array, default: () => [] },
    onEvaluate: { type: Function, default: null }
});
defineEmits(['refresh', 'copy-cause', 'select-cause']);

const topCause = computed(() => props.causes[0] || null);

function priorityClass(priority) {
    const p = (priority || 'info').toLowerCase();
    if (p === 'p0' || p === 'fatal') return 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20';
    if (p === 'p1' || p === 'error') return 'border-orange-500/30 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20';
    if (p === 'p2' || p === 'warning') return 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/20';
    return 'border-info/30 bg-info/10 text-info hover:bg-info/20';
}
</script>

<template>
    <div class="flex h-full bg-zinc-50 text-zinc-800 overflow-hidden relative">
        <!-- Sidebar -->
        <aside :style="{ width: sidebarWidth + 'px' }" class="flex flex-col border-r border-zinc-200 bg-white shrink-0 shadow-inner z-10 relative">
            <header class="flex items-center justify-between p-4 border-b border-zinc-200 bg-zinc-50/50">
                <div class="flex flex-col">
                    <strong class="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
                        智能诊断
                    </strong>
                    <span class="text-[10px] text-zinc-500 font-mono mt-0.5">{{ causes.length }} 个根因线索</span>
                </div>
                <button class="px-2.5 py-1.5 text-xs font-medium rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 transition-colors border border-transparent outline-none flex items-center gap-1.5" type="button" @click="$emit('refresh')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                    刷新
                </button>
            </header>

            <div v-if="!causes.length" class="p-6 text-xs text-zinc-500 text-center leading-relaxed">
                <div class="w-12 h-12 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center mx-auto mb-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-600"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </div>
                复现问题后会自动聚合 JS、接口、Bridge、资源和 logcat 线索。
            </div>

            <div v-else class="flex-1 overflow-y-auto p-3 flex flex-col gap-2 custom-scrollbar">
                <button
                    v-for="item in causes"
                    :key="item.id"
                    class="flex flex-col text-left p-3 rounded-lg border transition-all relative overflow-hidden group outline-none"
                    :class="[
                        cause?.id === item.id 
                            ? 'bg-white border-accent/50 shadow-md ring-1 ring-accent/30' 
                            : 'bg-zinc-50 border-zinc-200 hover:bg-white hover:border-zinc-300'
                    ]"
                    type="button"
                    @click="$emit('select-cause', item.id)"
                >
                    <div class="absolute left-0 top-0 bottom-0 w-1 transition-colors" :class="cause?.id === item.id ? 'bg-accent' : 'bg-transparent group-hover:bg-zinc-300'"></div>
                    
                    <div class="flex items-center gap-2 mb-1.5 pl-1.5">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase border" :class="priorityClass(item.priority)">
                            {{ item.priority || 'INFO' }}
                        </span>
                        <span class="text-xs text-zinc-500 font-mono flex-1 text-right">{{ formatTime(item.lastSeen) }}</span>
                    </div>
                    <span class="text-sm font-semibold text-zinc-800 line-clamp-2 leading-snug pl-1.5 group-hover:text-zinc-900 transition-colors">{{ item.title }}</span>
                    <small class="text-[10px] text-zinc-500 mt-2 pl-1.5 flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        拦截 {{ item.count || 1 }} 次
                    </small>
                </button>
            </div>

            <!-- Resizer Handle -->
            <div 
                @mousedown="startDrag"
                class="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-accent/30 z-20 transition-colors"
                style="transform: translateX(50%);"
            ></div>
        </aside>

        <!-- Main Content -->
        <main class="flex-1 flex flex-col min-w-0 bg-zinc-50">
            <header class="flex items-center justify-between p-4 border-b border-zinc-200 bg-white/60 backdrop-blur shrink-0 shadow-sm">
                <div class="flex flex-col min-w-0 pr-4">
                    <h2 class="text-lg font-semibold text-zinc-900 truncate" :title="cause?.title || topCause?.title">
                        {{ cause?.title || topCause?.title || '等待诊断结果' }}
                    </h2>
                    <p class="text-xs text-zinc-500 mt-1 flex items-center gap-2">
                        <template v-if="cause">
                            <span class="inline-flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>{{ cause.owner || '-' }}</span>
                            <span class="w-1 h-1 rounded-full bg-zinc-700"></span>
                            <span>{{ cause.count || 1 }} 次出现</span>
                        </template>
                        <template v-else>采集后会展示最可能的根因和证据链。</template>
                    </p>
                </div>
                <button class="px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20 outline-none disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center gap-2" type="button" :disabled="!cause" @click="$emit('copy-cause')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    复制定位
                </button>
            </header>

            <section class="flex-1 overflow-auto p-6 custom-scrollbar relative">
                <CauseDetail v-if="cause" :cause="cause" :on-evaluate="onEvaluate" />
                <div v-else class="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
                    <div class="w-16 h-16 rounded-full border border-dashed border-zinc-300 bg-white flex items-center justify-center mb-4">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-600"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
                    </div>
                    <span class="text-sm">暂无选中的诊断结果</span>
                </div>
            </section>
        </main>
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
    background: #3f3f46;
    border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #52525b;
}
</style>
