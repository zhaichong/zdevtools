<script setup>
import { ref, computed } from 'vue';
import { redact } from '@/shared/utils/redact.js';
import { formatTime } from '@/shared/utils/format.js';
import TimelineView from './TimelineView.vue';
import StackView from './StackView.vue';

const props = defineProps({
    cause: { type: Object, default: null },
    onEvaluate: { type: Function, default: null }
});

const expandedSections = ref(new Set(['root', 'source', 'stack', 'evidence', 'investigate']));

function toggleSection(id) {
    if (expandedSections.value.has(id)) {
        expandedSections.value.delete(id);
    } else {
        expandedSections.value.add(id);
    }
}

function severityClass(priority) {
    if (priority === 'P0') return 'danger';
    if (priority === 'P1' || priority === 'P2') return 'warning';
    return 'info';
}

function severityColor(priority) {
    if (priority === 'P0') return '#ef4444';
    if (priority === 'P1' || priority === 'P2') return '#f59e0b';
    return '#3b82f6';
}

function splitSteps(text) {
    const parts = String(text || '').split(/(?:\d+\.\s*)|[；;]/).map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : [String(text || '')];
}

function formatTimestamp(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', { hour12: false });
}

const quickChecks = computed(() => {
    if (!props.cause) return [];
    const checks = [];
    const id = props.cause.id || '';
    const kind = props.cause.kind || '';
    const methods = props.cause.methods || [];

    if (id === 'global-method:missing' && methods.length) {
        for (const m of methods) checks.push({ label: `typeof ${m}`, expr: `typeof ${m}` });
    }
    else if (id.startsWith('method-missing:')) {
        const path = id.split(':')[1];
        if (path) checks.push({ label: `typeof ${path}`, expr: `typeof ${path}` });
    }
    else if (id === 'bridge:missing-window') {
        checks.push({ label: 'typeof window.android', expr: 'typeof window.android' });
    }
    else if (id.startsWith('bridge:missing-methods:')) {
        const parts = id.split(':')[2];
        if (parts) {
            for (const m of parts.split(',')) checks.push({ label: `typeof window.android.${m}`, expr: `typeof window.android.${m}` });
        }
    }
    else if (kind === 'resource') {
        const ev = props.cause.evidence?.[0];
        const url = ev?.url || ev?.name || '';
        if (url) checks.push({ label: '检查资源是否已加载', expr: `JSON.stringify(performance.getEntriesByName('${url.replace(/'/g, "\\'")}').map(e => ({name: e.name, size: e.transferSize, dur: Math.round(e.duration)})))` });
    }
    else if (id === 'context:blank') {
        checks.push({ label: 'DOM 节点数', expr: 'document.querySelectorAll("*").length' });
        checks.push({ label: 'body 文本长度', expr: 'document.body?.innerText?.length || 0' });
        checks.push({ label: 'Vue 实例', expr: 'document.querySelector("#app")?.__vue__ ? "已挂载" : "未挂载"' });
        checks.push({ label: '当前 URL', expr: 'location.href' });
    }
    else if (id === 'context:error-html') {
        checks.push({ label: '解析 err 参数', expr: 'new URLSearchParams(location.search).get("err") || "无"' });
    }
    else if (kind === 'vue') {
        checks.push({ label: '当前路由', expr: 'JSON.stringify(document.querySelector("#app")?.__vue__?.$route?.fullPath || "无路由")' });
        checks.push({ label: 'Vue 版本', expr: 'document.querySelector("#app")?.__vue_app__?.version || document.querySelector("#app")?.__vue__?.constructor?.version || "未知"' });
    }
    else if (id.startsWith('api:')) {
        checks.push({ label: '检查当前 URL 参数', expr: 'JSON.stringify({orgId: new URLSearchParams(location.search).get("orgId"), deptId: new URLSearchParams(location.search).get("deptId")})' });
        checks.push({ label: '检查 localStorage token', expr: 'Object.keys(localStorage).filter(k => /token|auth/i.test(k)).join(", ") || "无 token 相关 key"' });
    }
    else if (id.startsWith('mqtt:')) {
        checks.push({ label: '检查网络状态', expr: 'navigator.onLine ? "在线" : "离线"' });
    }
    if (!checks.length) {
        checks.push({ label: '当前 URL', expr: 'location.href' });
        checks.push({ label: 'readyState', expr: 'document.readyState' });
    }
    return checks;
});

async function runCheck(check) {
    if (!props.onEvaluate) return;
    check.loading = true;
    check.result = null;
    check.ok = null;
    try {
        const val = await props.onEvaluate(check.expr);
        check.result = String(val ?? 'null');
        check.ok = !(/undefined|null|not|missing|离线|无|未知/.test(String(val)) && String(val) !== '"未挂载"');
    } catch (e) {
        check.result = `错误: ${e.message}`;
        check.ok = false;
    } finally {
        check.loading = false;
    }
}
</script>

<template>
    <div v-if="cause" class="sentry-cause">
        <div class="issue-header" :class="severityClass(cause.priority)">
            <div class="issue-badge" :style="{ borderColor: severityColor(cause.priority) }">
                <span class="priority-tag" :style="{ background: severityColor(cause.priority) }">{{ cause.priority }}</span>
                <strong class="issue-title">{{ cause.title }}</strong>
            </div>
            <div class="issue-meta">
                <span class="meta-item" title="Occurrences"><span class="meta-icon">◎</span> {{ cause.count }} 次</span>
                <span class="meta-item" title="First seen"><span class="meta-icon">⏱</span> {{ formatTimestamp(cause.firstSeen) }}</span>
                <span class="meta-item" title="Last seen"><span class="meta-icon">↻</span> {{ formatTimestamp(cause.lastSeen) }}</span>
                <span class="meta-item tag" title="Owner">{{ cause.owner }}</span>
            </div>
        </div>

        <section class="collapsible-section">
            <button class="section-header" type="button" @click="toggleSection('root')">
                <span class="section-toggle">{{ expandedSections.has('root') ? '▾' : '▸' }}</span>
                <span class="section-title">Root Cause</span>
            </button>
            <div v-if="expandedSections.has('root')" class="section-body">
                <div class="cause-summary">
                    <p class="summary-text">{{ redact(cause.summary) }}</p>
                    <p class="reason-text">{{ cause.reason }}</p>
                </div>
                <div class="cause-actions">
                    <div class="action-item"><span class="action-label">触发点</span><span class="action-value">{{ cause.trigger || '未识别' }}</span></div>
                    <div class="action-item"><span class="action-label">责任方向</span><span class="action-value">{{ cause.owner }}</span></div>
                </div>
                <div class="next-steps">
                    <span class="steps-label">Next Steps</span>
                    <ol class="step-list"><li v-for="(step, i) in splitSteps(cause.next)" :key="i">{{ step }}</li></ol>
                </div>
            </div>
        </section>

        <section class="collapsible-section">
            <button class="section-header" type="button" @click="toggleSection('source')">
                <span class="section-toggle">{{ expandedSections.has('source') ? '▾' : '▸' }}</span>
                <span class="section-title">Source Location</span>
                <span v-if="cause.source?.mode === 'source-map'" class="section-badge good">SourceMap ✓</span>
                <span v-else class="section-badge bad">No SourceMap</span>
            </button>
            <div v-if="expandedSections.has('source')" class="section-body">
                <template v-if="cause.source?.mode === 'source-map'">
                    <div class="source-info">
                        <div class="source-row"><span class="source-key">File</span><span class="source-val">{{ cause.source.source || '-' }}:{{ cause.source.line || '-' }}:{{ cause.source.column || '-' }}</span></div>
                        <div class="source-row"><span class="source-key">Function</span><span class="source-val">{{ cause.source.name || cause.trigger || '-' }}</span></div>
                    </div>
                </template>
                <template v-else>
                    <div class="source-missing"><p>{{ cause.source?.reason || '未上传对应 .map 文件' }}</p><p class="hint">上传 SourceMap 后会自动重新匹配。</p></div>
                </template>
            </div>
        </section>

        <section class="collapsible-section">
            <button class="section-header" type="button" @click="toggleSection('stack')">
                <span class="section-toggle">{{ expandedSections.has('stack') ? '▾' : '▸' }}</span>
                <span class="section-title">Stack Trace</span>
                <span v-if="cause.stack?.length" class="section-badge neutral">{{ cause.stack.length }} frames</span>
            </button>
            <div v-if="expandedSections.has('stack')" class="section-body"><StackView :stack="cause.stack" /></div>
        </section>

        <section class="collapsible-section">
            <button class="section-header" type="button" @click="toggleSection('breadcrumbs')">
                <span class="section-toggle">{{ expandedSections.has('breadcrumbs') ? '▾' : '▸' }}</span>
                <span class="section-title">Breadcrumbs (120s)</span>
                <span v-if="cause.related?.length" class="section-badge neutral">{{ cause.related.length }}</span>
            </button>
            <div v-if="expandedSections.has('breadcrumbs')" class="section-body"><TimelineView :items="cause.related" /></div>
        </section>

        <section class="collapsible-section">
            <button class="section-header" type="button" @click="toggleSection('evidence')">
                <span class="section-toggle">{{ expandedSections.has('evidence') ? '▾' : '▸' }}</span>
                <span class="section-title">Evidence</span>
                <span v-if="cause.evidence?.length" class="section-badge neutral">{{ cause.evidence.length }}</span>
            </button>
            <div v-if="expandedSections.has('evidence')" class="section-body">
                <template v-if="cause.evidence?.length">
                    <pre v-for="(item, i) in cause.evidence.slice(-4)" :key="i" class="evidence-code">{{ redact(JSON.stringify(item, null, 2)) }}</pre>
                </template>
                <div v-else class="empty-mini">暂无证据。</div>
            </div>
        </section>

        <section class="collapsible-section" v-if="quickChecks.length && onEvaluate">
            <button class="section-header" type="button" @click="toggleSection('investigate')">
                <span class="section-toggle">{{ expandedSections.has('investigate') ? '▾' : '▸' }}</span>
                <span class="section-title">Quick Investigate</span>
                <span class="section-badge neutral">{{ quickChecks.length }} checks</span>
            </button>
            <div v-if="expandedSections.has('investigate')" class="section-body">
                <div v-for="(check, i) in quickChecks" :key="i" class="check-row">
                    <button class="btn ghost btn-check" type="button" :disabled="check.loading" @click="runCheck(check)">{{ check.loading ? '...' : '▶' }} {{ check.label }}</button>
                    <span v-if="check.result !== null && check.result !== undefined" class="check-result" :class="check.ok ? 'good' : 'bad'">{{ redact(check.result) }}</span>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
.sentry-cause { max-width: 800px; }
.issue-header { padding: 12px; border-radius: 6px; background: #1e1e1e; border: 1px solid #333; margin-bottom: 12px; }
.issue-badge { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; border-left: 3px solid; padding-left: 10px; }
.priority-tag { padding: 2px 8px; border-radius: 3px; color: #fff; font-size: 11px; font-weight: 700; }
.issue-title { font-size: 15px; color: #f0f0f0; }
.issue-meta { display: flex; gap: 16px; flex-wrap: wrap; }
.meta-item { font-size: 11px; color: #888; display: flex; align-items: center; gap: 4px; }
.meta-icon { font-size: 12px; }
.meta-item.tag { background: #1e3a5f; color: #93c5fd; padding: 1px 6px; border-radius: 3px; }
.collapsible-section { border: 1px solid #2a2a2a; border-radius: 4px; margin-bottom: 8px; overflow: hidden; }
.section-header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #1a1a1a; border: none; color: #ccc; cursor: pointer; width: 100%; text-align: left; font-size: 12px; }
.section-header:hover { background: #222; }
.section-toggle { color: #666; font-size: 10px; }
.section-title { font-weight: 600; color: #ddd; }
.section-badge { font-size: 10px; padding: 1px 6px; border-radius: 3px; margin-left: auto; }
.section-badge.good { background: #064e3b; color: #6ee7b7; }
.section-badge.bad { background: #7f1d1d; color: #fca5a5; }
.section-badge.neutral { background: #333; color: #aaa; }
.section-body { padding: 10px 12px; border-top: 1px solid #2a2a2a; }
.cause-summary { margin-bottom: 10px; }
.summary-text { font-size: 13px; color: #f0f0f0; font-weight: 500; margin: 0 0 4px 0; }
.reason-text { font-size: 12px; color: #aaa; margin: 0; }
.cause-actions { display: flex; gap: 16px; margin-bottom: 10px; }
.action-item { display: flex; flex-direction: column; gap: 2px; }
.action-label { font-size: 10px; color: #666; text-transform: uppercase; }
.action-value { font-size: 12px; color: #ddd; }
.next-steps { margin-top: 8px; }
.steps-label { font-size: 10px; color: #666; text-transform: uppercase; display: block; margin-bottom: 4px; }
.step-list { margin: 0; padding-left: 18px; font-size: 12px; color: #ccc; }
.step-list li { margin-bottom: 3px; }
.source-info { display: flex; flex-direction: column; gap: 4px; }
.source-row { display: flex; gap: 12px; font-size: 12px; }
.source-key { color: #93c5fd; min-width: 70px; }
.source-val { color: #ddd; font-family: monospace; font-size: 11px; word-break: break-all; }
.source-missing { font-size: 12px; color: #aaa; }
.source-missing .hint { color: #666; font-size: 11px; }
.check-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #222; }
.check-row:last-child { border-bottom: none; }
.btn-check { font-size: 11px; padding: 3px 8px; min-width: 140px; text-align: left; white-space: nowrap; }
.btn-check:disabled { opacity: 0.5; }
.check-result { font-size: 11px; font-family: monospace; padding: 2px 8px; border-radius: 3px; word-break: break-all; max-width: 400px; overflow: hidden; text-overflow: ellipsis; }
.check-result.good { background: #064e3b; color: #6ee7b7; }
.check-result.bad { background: #7f1d1d; color: #fca5a5; }
</style>
