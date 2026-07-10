
<script setup>
import { computed, ref } from 'vue';
import { redact } from '@/shared/utils/redact.js';
import { formatTime } from '@/shared/utils/format.js';

const props = defineProps({
    cause: { type: Object, default: null },
    onEvaluate: { type: Function, default: null }
});

const checks = ref([]);

const sourceLabel = computed(() => {
    const source = props.cause?.source;
    if (!source) return '未匹配';
    if (source.mode === 'source-map') return `${source.source}:${source.line}:${source.column}`;
    return source.reason || '未匹配';
});

const evidence = computed(() => (props.cause?.evidence || []).slice(-4));
const related = computed(() => (props.cause?.related || []).slice(-8));
const confidenceText = computed(() => {
    if (typeof props.cause?.confidence !== 'number') return '-';
    return `${Math.round(props.cause.confidence * 100)}%`;
});

const quickChecks = computed(() => {
    if (!props.cause) return [];
    const id = props.cause.id || '';
    const kind = props.cause.kind || '';
    if (id === 'bridge:missing-window') return [{ label: 'window.android', expr: 'typeof window.android' }];
    if (kind === 'vue') return [{ label: 'Vue 版本', expr: 'document.querySelector("#app")?.__vue_app__?.version || document.querySelector("#app")?.__vue__?.constructor?.version || "unknown"' }];
    if (kind === 'network') return [{ label: '当前 URL 参数', expr: 'JSON.stringify(Object.fromEntries(new URLSearchParams(location.search).entries()))' }];
    return [
        { label: 'readyState', expr: 'document.readyState' },
        { label: '当前 URL', expr: 'location.href' }
    ];
});

async function runCheck(check) {
    if (!props.onEvaluate) return;
    const item = { ...check, loading: true, result: '' };
    checks.value = [item, ...checks.value.filter(c => c.label !== check.label)].slice(0, 6);
    try {
        item.result = redact(String(await props.onEvaluate(check.expr) ?? 'null'));
    } catch (error) {
        item.result = `错误：${error.message}`;
    } finally {
        item.loading = false;
    }
}

function priorityColor(priority) {
    const p = (priority || 'info').toLowerCase();
    if (p === 'p0' || p === 'fatal') return 'text-danger bg-danger/10 border-danger/30';
    if (p === 'p1' || p === 'error') return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
    if (p === 'p2' || p === 'warning') return 'text-warning bg-warning/10 border-warning/30';
    return 'text-info bg-info/10 border-info/30';
}
</script>

<template>
    <div v-if="cause" class="flex flex-col gap-8 max-w-4xl mx-auto">
        <!-- Hero Section -->
        <section class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase border" :class="priorityColor(cause.priority)">
                        {{ cause.priority || 'INFO' }}
                    </span>
                    <span class="text-xs text-zinc-500 font-mono">{{ cause.id }}</span>
                </div>
                <h2 class="text-2xl font-bold text-zinc-900 leading-snug">{{ redact(cause.title || '未命名问题') }}</h2>
                <p class="text-sm text-zinc-600 leading-relaxed max-w-3xl">{{ redact(cause.summary || cause.reason || '-') }}</p>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                <div class="p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                    <dt class="text-[10px] uppercase text-zinc-500 font-semibold mb-1">发生次数</dt>
                    <dd class="text-lg font-bold text-zinc-900">{{ cause.count || 1 }}</dd>
                </div>
                <div class="p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                    <dt class="text-[10px] uppercase text-zinc-500 font-semibold mb-1">最近发生</dt>
                    <dd class="text-sm font-mono text-zinc-800 mt-1">{{ formatTime(cause.lastSeen) }}</dd>
                </div>
                <div class="p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                    <dt class="text-[10px] uppercase text-zinc-500 font-semibold mb-1">分析置信度</dt>
                    <dd class="text-lg font-bold text-accent">{{ confidenceText }}</dd>
                </div>
                <div class="p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                    <dt class="text-[10px] uppercase text-zinc-500 font-semibold mb-1">排查方向</dt>
                    <dd class="text-sm font-medium text-zinc-800 mt-1">{{ cause.owner || '-' }}</dd>
                </div>
            </div>
        </section>

        <!-- Suggested Action -->
        <section class="flex flex-col gap-3 p-5 rounded-xl border border-accent/20 bg-accent/5 relative overflow-hidden">
            <div class="absolute top-0 left-0 w-1 h-full bg-accent"></div>
            <h3 class="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
                建议处理方案
            </h3>
            <p class="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{{ redact(cause.next || '暂无建议。') }}</p>
        </section>

        <!-- Code Context -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <article class="flex flex-col gap-2">
                <h3 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider pl-1">SourceMap 定位</h3>
                <div class="p-3 rounded-lg border border-zinc-200 bg-white font-mono text-xs break-all"
                     :class="cause.source?.mode === 'source-map' ? 'text-success border-success/30 bg-success/5' : 'text-zinc-500'">
                    {{ sourceLabel }}
                </div>
            </article>
            <article class="flex flex-col gap-2">
                <h3 class="text-xs font-semibold text-zinc-500 uppercase tracking-wider pl-1">触发上下文</h3>
                <div class="p-3 rounded-lg border border-zinc-200 bg-white font-mono text-xs text-zinc-500 break-all">
                    {{ redact(cause.trigger || '-') }}
                </div>
            </article>
        </section>

        <!-- Related Evidence -->
        <section class="flex flex-col gap-3">
            <h3 class="text-sm font-bold text-zinc-900 border-b border-zinc-200 pb-2">关联原始证据</h3>
            <div v-if="!evidence.length" class="p-4 text-center text-sm text-zinc-500 border border-dashed border-zinc-300 rounded-lg bg-zinc-50/50">
                暂无底层的关联证据。
            </div>
            <div v-else class="flex flex-col gap-3">
                <pre v-for="(item, index) in evidence" :key="index" class="p-4 rounded-lg border border-zinc-200 bg-zinc-50 text-xs font-mono text-zinc-700 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed selection:bg-accent/30">{{ redact(JSON.stringify(item, null, 2)) }}</pre>
            </div>
        </section>

        <!-- Related Events -->
        <section class="flex flex-col gap-3">
            <h3 class="text-sm font-bold text-zinc-900 border-b border-zinc-200 pb-2">错误前线索链</h3>
            <div v-if="!related.length" class="p-4 text-center text-sm text-zinc-500 border border-dashed border-zinc-300 rounded-lg bg-zinc-50/50">
                暂无关联的历史事件。
            </div>
            <div v-else class="flex flex-col gap-2">
                <div v-for="(item, index) in related" :key="index" class="flex items-start gap-3 p-3 rounded-lg border border-zinc-200 bg-white shadow-sm">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border border-zinc-300 bg-zinc-100 text-zinc-500 shrink-0 mt-0.5">
                        {{ item.type || 'event' }}
                    </span>
                    <strong class="text-sm text-zinc-800 font-medium leading-snug break-words">{{ redact(item.message || '-') }}</strong>
                </div>
            </div>
        </section>

        <!-- Quick Checks -->
        <section v-if="onEvaluate" class="flex flex-col gap-4 pt-4 border-t border-zinc-200">
            <div class="flex items-center justify-between">
                <h3 class="text-sm font-bold text-zinc-900">实时快速检查 (CDP)</h3>
                <span class="text-xs text-zinc-500">向目标页面注入探针执行验证</span>
            </div>
            
            <div class="flex flex-wrap gap-2">
                <button v-for="check in quickChecks" :key="check.label" class="px-3 py-1.5 text-xs font-medium rounded text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 transition-colors outline-none flex items-center gap-1.5 shadow-sm" type="button" @click="runCheck(check)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-400"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    {{ check.label }}
                </button>
            </div>
            
            <div v-if="checks.length > 0" class="flex flex-col gap-2 mt-2">
                <div v-for="item in checks" :key="item.label" class="flex flex-col gap-1.5 p-3 rounded-lg border border-zinc-200 bg-white shadow-sm">
                    <span class="text-xs font-semibold text-zinc-600">{{ item.label }}</span>
                    <code class="text-xs font-mono break-all" :class="item.loading ? 'text-zinc-500 animate-pulse' : (item.result.startsWith('错误') ? 'text-danger' : 'text-success')">
                        {{ item.loading ? '检查中...' : item.result }}
                    </code>
                </div>
            </div>
        </section>
    </div>
</template>
