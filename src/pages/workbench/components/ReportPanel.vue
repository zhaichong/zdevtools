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
    <div class="flex flex-col h-full bg-zinc-50 text-zinc-800 p-4 overflow-hidden gap-4">
        <!-- Header -->
        <header class="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-200 pb-3 shrink-0">
            <div>
                <h2 class="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    诊断报告
                </h2>
                <p class="text-xs text-zinc-500 mt-1">默认脱敏，生成给业务前端、排查留档或 AI 分析用的证据包。</p>
            </div>
            <div class="flex items-center gap-3 mt-3 md:mt-0">
                <button class="px-3 py-1.5 text-xs font-medium rounded text-white bg-accent hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20 outline-none" type="button" @click="emit('copy-markdown')">
                    复制报告
                </button>
            </div>
        </header>

        <!-- Tabs -->
        <div class="flex p-1 gap-1 rounded-lg border border-zinc-200 bg-white shadow-sm shrink-0 w-max">
            <button class="px-4 py-1.5 text-xs font-medium rounded-md transition-colors outline-none" :class="tab === 'short' ? 'bg-zinc-100 text-zinc-900 shadow-sm border border-zinc-200' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'" type="button" @click="tab = 'short'">短报告</button>
            <button class="px-4 py-1.5 text-xs font-medium rounded-md transition-colors outline-none" :class="tab === 'long' ? 'bg-zinc-100 text-zinc-900 shadow-sm border border-zinc-200' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'" type="button" @click="tab = 'long'">长报告</button>
            <button class="px-4 py-1.5 text-xs font-medium rounded-md transition-colors outline-none" :class="tab === 'json' ? 'bg-zinc-100 text-zinc-900 shadow-sm border border-zinc-200' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'" type="button" @click="tab = 'json'">源 JSON</button>
        </div>

        <!-- Content Area -->
        <div class="flex-1 min-h-0 relative rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <div class="flex-1 overflow-auto p-4 custom-scrollbar">
                <pre v-if="tab === 'short'" class="text-sm font-mono text-zinc-800 whitespace-pre-wrap break-words leading-relaxed selection:bg-accent/30">{{ shortText }}</pre>
                <pre v-else-if="tab === 'long'" class="text-sm font-mono text-zinc-800 whitespace-pre-wrap break-words leading-relaxed selection:bg-accent/30">{{ markdown || '暂无报告。' }}</pre>
                <pre v-else class="text-xs font-mono text-zinc-600 whitespace-pre-wrap break-words leading-relaxed selection:bg-accent/30">{{ jsonText }}</pre>
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
