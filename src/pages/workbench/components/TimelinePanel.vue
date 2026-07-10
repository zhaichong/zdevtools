
<script setup>
import { computed, ref } from 'vue';
import { formatTime } from '@/shared/utils/format.js';
import { redact } from '@/shared/utils/redact.js';

const props = defineProps({
    items: { type: Array, default: () => [] },
    causes: { type: Array, default: () => [] }
});

const selectedIndex = ref(0);

const normalized = computed(() => {
    const events = (props.items || []).map(item => ({
        time: item.time || item.ts || Date.now(),
        type: item.type || item.kind || 'event',
        message: item.message || item.title || '',
        raw: item
    }));
    const causeEvents = (props.causes || []).map(cause => ({
        time: cause.lastSeen || cause.firstSeen || Date.now(),
        type: cause.kind || 'cause',
        message: `${cause.priority || 'INFO'} ${cause.title || 'Root cause'}`,
        raw: cause
    }));
    return [...events, ...causeEvents].sort((a, b) => a.time - b.time);
});

const selected = computed(() => normalized.value[selectedIndex.value] || normalized.value[0] || null);
const errorCount = computed(() => normalized.value.filter(item => ['js', 'vue', 'network', 'resource', 'cause'].includes(item.type)).length);
const selectedRawText = computed(() => {
    try {
        return redact(JSON.stringify(selected.value?.raw || {}, null, 2));
    } catch {
        return '事件详情无法序列化';
    }
});

function typeLabel(type) {
    const labels = {
        network: '接口',
        js: 'JS',
        vue: 'Vue',
        resource: '资源',
        bridge: 'Bridge',
        route: '路由',
        click: '点击',
        console: 'Console',
        probe: '探针',
        logcat: 'logcat',
        cause: '根因'
    };
    return labels[type] || type || '事件';
}

function typeColorClass(type) {
    const colors = {
        network: 'bg-blue-50 text-blue-600 border-blue-200',
        js: 'bg-red-50 text-red-600 border-red-200',
        vue: 'bg-emerald-50 text-emerald-600 border-emerald-200',
        resource: 'bg-amber-50 text-amber-600 border-amber-200',
        bridge: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200',
        route: 'bg-cyan-50 text-cyan-600 border-cyan-200',
        click: 'bg-zinc-100 text-zinc-600 border-zinc-200',
        console: 'bg-zinc-100 text-zinc-600 border-zinc-200',
        cause: 'bg-rose-500/10 text-rose-600 border-rose-500/20'
    };
    return colors[type] || 'bg-zinc-100 text-zinc-600 border-zinc-200';
}
</script>

<template>
    <div class="flex flex-col h-full bg-zinc-50 text-zinc-800 p-4 overflow-hidden gap-4">
        <!-- Header -->
        <header class="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-200 pb-3 shrink-0">
            <div>
                <h2 class="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    时间轴
                </h2>
                <p class="text-xs text-zinc-500 mt-1">按发生顺序串联点击、路由、接口、console、异常和 logcat。</p>
            </div>
            <div class="flex items-center gap-3 mt-3 md:mt-0">
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-200 bg-white text-xs font-medium text-zinc-600 shadow-sm">
                    <span>{{ normalized.length }} 事件</span>
                </div>
                <div v-if="errorCount > 0" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-danger/20 bg-danger/10 text-xs font-medium text-danger shadow-inner">
                    <span>{{ errorCount }} 关键异常</span>
                </div>
            </div>
        </header>

        <div v-if="!normalized.length" class="flex-1 grid place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 text-sm shadow-sm">
            暂无时间轴事件。复现问题后会自动出现。
        </div>
        
        <div v-else class="flex flex-1 min-h-0 gap-4 overflow-hidden">
            <!-- Left: Timeline List -->
            <div class="w-1/2 flex flex-col border border-zinc-200 bg-white rounded-lg overflow-hidden relative shadow-sm">
                <ol class="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-0">
                    <li
                        v-for="(item, index) in normalized"
                        :key="`${item.time}-${index}`"
                        class="relative pl-6 pb-4 group cursor-pointer transition-opacity"
                        :class="selectedIndex === index ? 'opacity-100' : 'opacity-60 hover:opacity-100'"
                        @click="selectedIndex = index"
                    >
                        <!-- Timeline Line -->
                        <div class="absolute left-[7px] top-[14px] bottom-[-14px] w-[2px] bg-zinc-200 group-last:bg-transparent"></div>
                        <!-- Timeline Dot -->
                        <div class="absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 bg-white transition-colors z-10"
                             :class="selectedIndex === index ? 'border-accent bg-accent/10 scale-125' : 'border-zinc-300'"></div>
                        
                        <div class="flex flex-col gap-1 rounded-lg border p-2.5 transition-all"
                             :class="selectedIndex === index ? 'bg-zinc-50 border-zinc-200 shadow-sm' : 'bg-transparent border-transparent group-hover:bg-zinc-50 group-hover:border-zinc-100'">
                            <div class="flex items-center gap-2">
                                <time class="text-xs font-mono text-zinc-500">{{ formatTime(item.time) }}</time>
                                <span class="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border inline-flex items-center"
                                      :class="typeColorClass(item.type)">
                                    {{ typeLabel(item.type) }}
                                </span>
                            </div>
                            <span class="text-[13px] text-zinc-700 line-clamp-2 leading-relaxed mt-0.5">{{ redact(item.message) }}</span>
                        </div>
                    </li>
                </ol>
            </div>

            <!-- Right: Event Detail -->
            <aside class="w-1/2 flex flex-col border border-zinc-200 bg-white backdrop-blur rounded-lg overflow-hidden shadow-sm">
                <div v-if="selected" class="flex flex-col h-full">
                    <header class="p-4 border-b border-zinc-200 bg-zinc-50/50">
                        <div class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border mb-2" :class="typeColorClass(selected.type)">
                            {{ typeLabel(selected.type) }}
                        </div>
                        <h3 class="text-sm font-semibold text-zinc-900 leading-snug break-words">{{ redact(selected.message) || '事件详情' }}</h3>
                        
                        <dl class="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-200">
                            <div>
                                <dt class="text-[10px] uppercase text-zinc-500 font-semibold mb-1">发生时间</dt>
                                <dd class="text-xs font-mono text-zinc-700">{{ formatTime(selected.time) }}</dd>
                            </div>
                            <div>
                                <dt class="text-[10px] uppercase text-zinc-500 font-semibold mb-1">事件类型</dt>
                                <dd class="text-xs text-zinc-700">{{ typeLabel(selected.type) }}</dd>
                            </div>
                        </dl>
                    </header>
                    <div class="flex-1 overflow-auto p-4 custom-scrollbar">
                        <pre class="bg-zinc-50 p-3 rounded-lg border border-zinc-200 text-xs font-mono text-zinc-600 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed selection:bg-accent/30">{{ selectedRawText }}</pre>
                    </div>
                </div>
            </aside>
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
</style>
