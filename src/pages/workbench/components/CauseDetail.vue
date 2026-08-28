
<script setup>
import { computed, ref } from 'vue';
import { redact } from '@/shared/utils/redact.js';
import { formatTime } from '@/shared/utils/format.js';

const props = defineProps({
    cause: { type: Object, default: null },
    repairState: { type: Object, default: null },
    onEvaluate: { type: Function, default: null }
});

const emit = defineEmits(['start-repair', 'verify-repair']);

const checks = ref([]);

const sourceLabel = computed(() => {
    const source = props.cause?.source;
    if (!source) return '未匹配';
    if (source.mode === 'source-map') return `${source.source}:${source.line}:${source.column}`;
    return source.reason || '未匹配';
});

const evidence = computed(() => (props.cause?.evidence || []).slice(-4));
const related = computed(() => props.cause?.related || []);
const RELATED_TYPE_LABELS = {
    network: '接口', js: 'JS', vue: 'Vue', resource: '资源',
    bridge: 'Bridge', route: '路由', click: '点击',
    console: 'Console', probe: '探针', 'low-signal': '低价值线索'
};
function relatedTypeLabel(type) {
    return RELATED_TYPE_LABELS[type] || type || '事件';
}
const confidenceText = computed(() => {
    if (typeof props.cause?.confidence !== 'number') return '-';
    return `${Math.round(props.cause.confidence * 100)}%`;
});
const repairStatus = computed(() => ({
    repairing: '修复中（已建立基线）',
    verifying: '复验采集中',
    verified: '已验证：当前观察未复现',
    failed: '未通过：当前仍可复现'
}[props.repairState?.status] || '未建立复验基线'));

const repairPanelClass = computed(() => {
    const status = props.repairState?.status;
    if (status === 'failed') return 'border-orange-200 bg-orange-50/30';
    if (status === 'verified') return 'border-emerald-200 bg-emerald-50/30';
    if (status === 'verifying' || status === 'repairing') return 'border-zinc-200 bg-zinc-50/40';
    return 'border-emerald-200 bg-emerald-50/30';
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
    <div v-if="cause" class="flex flex-col gap-8 max-w-4xl mx-auto select-text">
        <!-- Hero Section -->
        <section class="flex flex-col gap-4 select-none">
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase border" :class="priorityColor(cause.priority)">
                        {{ cause.priority || 'INFO' }}
                    </span>
                    <span class="text-xs text-zinc-400 font-mono">{{ cause.id }}</span>
                </div>
                <h2 class="text-xl font-bold text-zinc-800 leading-snug">{{ redact(cause.title || '未命名问题') }}</h2>
                <p class="text-xs text-zinc-500 leading-relaxed max-w-3xl">{{ redact(cause.summary || cause.reason || '-') }}</p>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                <div class="p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                    <dt class="text-[10px] uppercase text-zinc-400 font-semibold mb-1">发生次数</dt>
                    <dd class="text-lg font-bold text-zinc-800">{{ cause.count || 1 }}</dd>
                </div>
                <div class="p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                    <dt class="text-[10px] uppercase text-zinc-400 font-semibold mb-1">最近发生</dt>
                    <dd class="text-xs font-mono text-zinc-700 mt-1.5">{{ formatTime(cause.lastSeen) }}</dd>
                </div>
                <div class="p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                    <dt class="text-[10px] uppercase text-zinc-400 font-semibold mb-1">分析置信度</dt>
                    <dd class="text-lg font-bold text-violet-600">{{ confidenceText }}</dd>
                </div>
                <div class="p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                    <dt class="text-[10px] uppercase text-zinc-400 font-semibold mb-1">排查方向</dt>
                    <dd class="text-xs font-semibold text-zinc-700 mt-1.5">{{ cause.owner || '-' }}</dd>
                </div>
            </div>
        </section>

        <!-- Suggested Action -->
        <section class="flex flex-col gap-3 p-5 rounded-xl border border-violet-200 bg-violet-50/30 relative overflow-hidden">
            <div class="absolute top-0 left-0 w-[3px] h-full bg-violet-600"></div>
            <h3 class="text-xs font-bold text-zinc-800 flex items-center gap-2 select-none">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-violet-600"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
                建议处理方案
            </h3>
            <p class="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap">{{ redact(cause.next || '暂无建议。') }}</p>
        </section>

        <section class="flex flex-col gap-3 p-5 rounded-xl border" :class="repairPanelClass">
            <div class="flex items-center justify-between gap-4">
                <div>
                    <h3 class="text-xs font-bold text-zinc-800">修复复验</h3>
                    <p class="text-xs text-zinc-600 mt-1">{{ repairStatus }}</p>
                </div>
                <span v-if="repairState?.attempts" class="text-[10px] text-zinc-500">尝试 {{ repairState.attempts }} 次</span>
            </div>
            <div class="flex flex-wrap gap-2">
                <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded border border-emerald-300 text-emerald-800 bg-white hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed" :disabled="repairState?.status === 'verifying'" @click="emit('start-repair')">
                    {{ repairState?.baseline ? '重新建立基线' : '建立复验基线' }}
                </button>
                <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded border border-zinc-300 text-zinc-700 bg-white hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed" :disabled="!repairState?.baseline || repairState?.status === 'verifying'" @click="emit('verify-repair')">
                    {{ repairState?.status === 'verifying' ? '复验采集中…' : '重新采集并复验' }}
                </button>
            </div>
            <p v-if="repairState?.lastVerification?.status === 'failed'" class="text-xs text-orange-700">基线之后再次观察到同一根因；请继续修复后再次复验。</p>
        </section>

        <!-- Code Context -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <article class="flex flex-col gap-2">
                <h3 class="text-[10px] uppercase text-zinc-400 font-semibold tracking-wider pl-1 select-none">SourceMap 定位</h3>
                <div class="p-3 rounded-lg border border-zinc-200 bg-white font-mono text-xs break-all"
                     :class="cause.source?.mode === 'source-map' ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-zinc-500 bg-zinc-50/20'">
                    {{ sourceLabel }}
                </div>
            </article>
            <article class="flex flex-col gap-2">
                <h3 class="text-[10px] uppercase text-zinc-400 font-semibold tracking-wider pl-1 select-none">触发上下文</h3>
                <div class="p-3 rounded-lg border border-zinc-200 bg-zinc-50/20 font-mono text-xs text-zinc-500 break-all">
                    {{ redact(cause.trigger || '-') }}
                </div>
            </article>
        </section>

        <!-- Related Evidence -->
        <section class="flex flex-col gap-3">
            <h3 class="text-xs font-bold text-zinc-800 border-b border-zinc-200 pb-2 select-none">关联原始证据</h3>
            <div v-if="!evidence.length" class="p-4 text-center text-xs text-zinc-400 border border-dashed border-zinc-250 rounded-lg bg-zinc-50/50 select-none">
                暂无底层的关联证据。
            </div>
            <div v-else class="flex flex-col gap-3">
                <pre v-for="(item, index) in evidence" :key="index" class="p-4 rounded-lg border border-zinc-150 bg-zinc-50/50 text-xs font-mono text-zinc-650 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed selection:bg-violet-200">{{ redact(JSON.stringify(item, null, 2)) }}</pre>
            </div>
        </section>

        <!-- Related Events -->
        <section class="flex flex-col gap-3">
            <h3 class="text-xs font-bold text-zinc-800 border-b border-zinc-200 pb-2 select-none">错误前线索链</h3>
            <div v-if="!related.length" class="p-4 text-center text-xs text-zinc-400 border border-dashed border-zinc-250 rounded-lg bg-zinc-50/50 select-none">
                暂无关联的历史事件。
            </div>
            <div v-else class="flex flex-col gap-2 select-none">
                <div v-for="(item, index) in related" :key="index" class="flex items-start gap-3 p-3 rounded-lg border border-zinc-150 bg-white shadow-3xs">
                    <time class="text-[10px] font-mono text-zinc-400 shrink-0 mt-0.5 w-16">{{ formatTime(item.time) }}</time>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border border-zinc-200 bg-zinc-50 text-zinc-450 shrink-0 mt-0.5">
                        {{ relatedTypeLabel(item.type) }}
                    </span>
                    <strong class="text-xs text-zinc-700 font-semibold leading-snug break-words">{{ redact(item.message || '-') }}</strong>
                </div>
            </div>
        </section>

        <!-- Quick Checks -->
        <section v-if="onEvaluate" class="flex flex-col gap-4 pt-4 border-t border-zinc-200 select-none">
            <div class="flex items-center justify-between">
                <h3 class="text-xs font-bold text-zinc-800">实时快速检查 (CDP)</h3>
                <span class="text-xs text-zinc-400">向目标页面注入探针执行验证</span>
            </div>
            
            <div class="flex flex-wrap gap-2">
                <button v-for="check in quickChecks" :key="check.label" class="px-3 py-1.5 text-xs font-semibold rounded border border-zinc-200 text-zinc-650 bg-white hover:bg-zinc-50 hover:text-zinc-950 transition-colors cursor-pointer outline-none flex items-center gap-1.5 shadow-3xs" type="button" @click="runCheck(check)">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-450"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    {{ check.label }}
                </button>
            </div>
            
            <div v-if="checks.length > 0" class="flex flex-col gap-2 mt-2 select-text">
                <div v-for="item in checks" :key="item.label" class="flex flex-col gap-1.5 p-3 rounded-lg border border-zinc-150 bg-white shadow-3xs">
                    <span class="text-xs font-semibold text-zinc-500">{{ item.label }}</span>
                    <code class="text-xs font-mono break-all" :class="item.loading ? 'text-zinc-450 animate-pulse' : (item.result.startsWith('错误') ? 'text-red-650' : 'text-emerald-700 font-bold')">
                        {{ item.loading ? '检查中...' : item.result }}
                    </code>
                </div>
            </div>
        </section>
    </div>
</template>
