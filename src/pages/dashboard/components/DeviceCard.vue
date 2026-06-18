<template>
    <article class="device-card">
        <div class="device-header">
            <div>
                <h3 class="device-name">{{ device.model || device.id || 'Unknown Device' }}</h3>
                <div class="device-meta">{{ metaText }}</div>
            </div>
            <span class="device-status" :class="device.status">{{ statusText }}</span>
        </div>
        <div v-if="device.diagnostics?.length" class="device-diagnostics">
            <div v-for="(msg, i) in device.diagnostics" :key="i">{{ msg }}</div>
        </div>
        <div class="processes-container">
            <div v-if="!device.processes?.length && device.status === 'device'" class="muted-row">
                未检测到可调试 WebView。请确认 App 开启 WebView 调试。
            </div>
            <div v-for="proc in device.processes || []" :key="proc.processName" class="process-card">
                <div class="process-title">{{ proc.processName }} · {{ proc.processHint || 'WebView' }} · Port {{ proc.localPort || '-' }}</div>
                <div class="targets-list">
                    <div v-if="!visibleTargets(proc).length" class="muted-row">没有可调试页面</div>
                    <div v-for="target in visibleTargets(proc)" :key="target.id" class="target-item">
                        <div class="target-main">
                            <div class="target-line">
                                <img v-if="target.faviconUrl" class="target-favicon" :src="target.faviconUrl" @error="$event.target.style.display='none'" alt="">
                                <strong class="target-title">{{ target.title || 'Untitled' }}</strong>
                                <span class="profile-badge" :class="profileFor(target).id">
                                    {{ diagnosisFor(target, proc)?.profile?.label || profileFor(target).label }}
                                </span>
                            </div>
                            <div class="target-url">{{ target.url }}</div>
                            <div class="target-signals" v-html="renderSignals(target, proc)"></div>
                        </div>
                        <div class="target-actions">
                            <button class="btn primary btn-workbench" @click="$emit('workbench', { device, proc, target })" type="button">调试工作台</button>
                            <button class="btn ghost btn-copy-link" @click="$emit('copy-link', { proc, target })" type="button">复制链接</button>
                        </div>
                    </div>
                </div>
                <div v-if="proc.diagnostics?.length" style="margin-top: 8px; color: var(--warning); font-size: 13px;">
                    {{ proc.diagnostics.join('; ') }}
                </div>
            </div>
        </div>
    </article>
</template>

<script setup>
import { identifyProject } from '@/shared/composables/useProjectIdentify.js';
import { escapeHtml } from '@/shared/utils/escape.js';
import { redact } from '@/shared/utils/redact.js';
import { safeUrl } from '@/shared/utils/format.js';

const props = defineProps({
    device: { type: Object, required: true },
    getDiagnosis: { type: Function, required: true }
});
defineEmits(['workbench', 'copy-link', 'diagnose']);

const statusText = props.device.status === 'device' ? 'online' : (props.device.status || 'unknown');
const metaText = [props.device.id, props.device.manufacturer, props.device.androidVersion ? `Android ${props.device.androidVersion}` : '', props.device.sdkVersion ? `SDK ${props.device.sdkVersion}` : ''].filter(Boolean).join(' · ');

function visibleTargets(proc) {
    return (proc.targets || []).filter(t => t.type === 'page' || t.type === 'webview');
}

function profileFor(target) {
    return identifyProject(target.url);
}

function diagnosisFor(target, proc) {
    return props.getDiagnosis(target, proc);
}

function renderSignals(target, proc) {
    const parts = [];
    const parsed = safeUrl(target.url);
    if (parsed?.hash) parts.push(`<span>route ${escapeHtml(parsed.hash)}</span>`);
    if (target.url?.includes('error.html')) parts.push('<span class="bad">error.html</span>');
    const diag = diagnosisFor(target, proc);
    if (diag) {
        parts.push(`<span class="${diag.summary.errorCount ? 'bad' : 'good'}">${diag.summary.errorCount} errors</span>`);
        if (diag.summary.networkFailures) parts.push(`<span class="bad">${diag.summary.networkFailures} failed requests</span>`);
        parts.push(`<span>last ${escapeHtml(diag.finishedAt)}</span>`);
    } else {
        parts.push('<span>未采集</span>');
    }
    return parts.join('');
}
</script>

<style scoped>
.process-card + .process-card {
    margin-top: 14px;
}
</style>
