<template>
    <article class="device-card">
        <div class="device-header">
            <div>
                <h3 class="device-name">{{ device.model || device.id || 'Unknown Device' }}</h3>
                <div class="device-meta">{{ metaText }}</div>
            </div>
            <span class="device-status" :class="device.status">{{ statusText }}</span>
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
                                    {{ profileFor(target).label }}
                                </span>
                            </div>
                            <div class="target-url">{{ target.url }}</div>
                        </div>
                        <div class="target-actions">
                            <button class="btn primary btn-workbench" @click="$emit('workbench', { device, proc, target })" type="button">调试工作台</button>
                        </div>
                    </div>
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
    device: { type: Object, required: true }
});
defineEmits(['workbench']);

const statusText = props.device.status === 'device' ? 'online' : (props.device.status || 'unknown');
const metaText = [props.device.id, props.device.manufacturer, props.device.androidVersion ? `Android ${props.device.androidVersion}` : '', props.device.sdkVersion ? `SDK ${props.device.sdkVersion}` : ''].filter(Boolean).join(' · ');

function visibleTargets(proc) {
    return (proc.targets || []).filter(t => t.type === 'page' || t.type === 'webview');
}

function profileFor(target) {
    return identifyProject(target.url);
}
</script>

<style scoped>
.process-card + .process-card {
    margin-top: 14px;
}
</style>
