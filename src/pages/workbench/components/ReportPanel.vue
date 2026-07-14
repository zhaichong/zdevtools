<script setup>
import { computed, ref } from 'vue';
import { redact } from '@/shared/utils/redact.js';

const props = defineProps({
    report: { type: Object, default: null },
    markdown: { type: String, default: '' },
    runId: { type: String, default: '' }
});
const emit = defineEmits(['copy-markdown', 'export-run']);

const tab = ref('short');
const jsonText = computed(() => {
    try {
        return redact(JSON.stringify(props.report || {}, null, 2));
    } catch {
        return '报告无法序列化。';
    }
});
const shortText = computed(() => {
    const cause = props.report?.causes?.[0];
    if (!cause) return '暂无诊断结论。';
    return [
        `根因：${cause.priority || 'INFO'} ${redact(cause.title || '-')}`,
        `摘要：${redact(cause.summary || '-')}`,
        `下一步：${redact(cause.next || '-')}`,
        `页面：${redact(props.report?.snapshot?.href || props.report?.target?.url || '-')}`
    ].join('\n');
});
</script>

<template>
    <div class="flex flex-col h-full bg-white text-zinc-800 p-4 overflow-hidden gap-4">
        <!-- Header -->
        <header class="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-200 pb-3 shrink-0 select-none">
            <div>
                <h2 class="text-sm font-bold text-zinc-800 flex items-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-violet-600"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                    诊断报告
                </h2>
                <p class="text-xs text-zinc-400 mt-1">默认脱敏，生成给业务前端、排查留档或 AI 分析用的证据包。</p>
            </div>
            <div class="flex items-center gap-3 mt-3 md:mt-0">
                <button class="px-3 py-1.5 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-sm outline-none cursor-pointer" type="button" @click="emit('copy-markdown')">
                    复制报告
                </button>
            </div>
        </header>

        <!-- Tabs -->
        <div class="flex p-0.5 gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 shadow-2xs shrink-0 w-max select-none">
            <button class="px-4 py-1 text-xs font-semibold rounded transition-colors outline-none cursor-pointer border border-transparent" :class="tab === 'short' ? 'bg-white text-violet-700 border-zinc-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-950 hover:bg-white/50'" type="button" @click="tab = 'short'">短报告</button>
            <button class="px-4 py-1 text-xs font-semibold rounded transition-colors outline-none cursor-pointer border border-transparent" :class="tab === 'long' ? 'bg-white text-violet-700 border-zinc-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-950 hover:bg-white/50'" type="button" @click="tab = 'long'">长报告</button>
            <button class="px-4 py-1 text-xs font-semibold rounded transition-colors outline-none cursor-pointer border border-transparent" :class="tab === 'json' ? 'bg-white text-violet-700 border-zinc-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-950 hover:bg-white/50'" type="button" @click="tab = 'json'">源 JSON</button>
        </div>

        <!-- Content Area -->
        <div class="flex-1 min-h-0 relative rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden flex flex-col">
            <div class="flex-1 overflow-auto p-4 custom-scrollbar">
                <pre v-if="tab === 'short'" class="text-xs font-mono text-zinc-800 whitespace-pre-wrap break-words leading-relaxed selection:bg-violet-250 bg-zinc-50 border border-zinc-150 rounded-lg p-4">{{ shortText }}</pre>
                <pre v-else-if="tab === 'long'" class="text-xs font-mono text-zinc-800 whitespace-pre-wrap break-words leading-relaxed selection:bg-violet-250 bg-zinc-50 border border-zinc-150 rounded-lg p-4">{{ markdown || '暂无报告。' }}</pre>
                <pre v-else class="text-xs font-mono text-zinc-650 whitespace-pre-wrap break-words leading-relaxed selection:bg-violet-250 bg-zinc-50 border border-zinc-150 rounded-lg p-4">{{ jsonText }}</pre>
            </div>
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
