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
</script>

<template>
    <div v-if="cause" class="cause-detail-v2">
        <section class="cause-hero" :class="(cause.priority || 'info').toLowerCase()">
            <div>
                <span class="priority-chip">{{ cause.priority || 'INFO' }}</span>
                <h2>{{ redact(cause.title || '未命名问题') }}</h2>
                <p>{{ redact(cause.summary || cause.reason || '-') }}</p>
            </div>
            <dl>
                <div><dt>次数</dt><dd>{{ cause.count || 1 }}</dd></div>
                <div><dt>最近</dt><dd>{{ formatTime(cause.lastSeen) }}</dd></div>
                <div><dt>置信度</dt><dd>{{ confidenceText }}</dd></div>
                <div><dt>方向</dt><dd>{{ cause.owner || '-' }}</dd></div>
            </dl>
        </section>

        <section class="cause-section">
            <h3>建议处理</h3>
            <p>{{ redact(cause.next || '暂无建议。') }}</p>
        </section>

        <section class="cause-grid">
            <article class="cause-section">
                <h3>SourceMap</h3>
                <div class="source-line" :class="{ good: cause.source?.mode === 'source-map' }">{{ sourceLabel }}</div>
            </article>
            <article class="cause-section">
                <h3>触发点</h3>
                <div class="source-line">{{ redact(cause.trigger || '-') }}</div>
            </article>
        </section>

        <section class="cause-section">
            <h3>关联证据</h3>
            <div v-if="!evidence.length" class="empty-mini">暂无证据。</div>
            <pre v-for="(item, index) in evidence" :key="index" class="cause-code">{{ redact(JSON.stringify(item, null, 2)) }}</pre>
        </section>

        <section class="cause-section">
            <h3>错误前证据链</h3>
            <div v-if="!related.length" class="empty-mini">暂无关联事件。</div>
            <div v-for="(item, index) in related" :key="index" class="cause-related-row">
                <span>{{ item.type || 'event' }}</span>
                <strong>{{ redact(item.message || '-') }}</strong>
            </div>
        </section>

        <section v-if="onEvaluate" class="cause-section">
            <h3>快速检查</h3>
            <div class="quick-checks">
                <button v-for="check in quickChecks" :key="check.label" class="btn secondary" type="button" @click="runCheck(check)">
                    {{ check.label }}
                </button>
            </div>
            <div v-for="item in checks" :key="item.label" class="check-output">
                <span>{{ item.label }}</span>
                <code>{{ item.loading ? '检查中...' : item.result }}</code>
            </div>
        </section>
    </div>
</template>
