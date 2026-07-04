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
                未检测到可调试 WebView。请确认 App 已开启 WebView 调试。
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
                                <span class="profile-badge" :class="profileFor(target).id">{{ profileFor(target).label }}</span>
                            </div>
                            <div class="target-url">{{ target.url }}</div>
                        </div>
                        <div class="target-actions">
                            <button class="btn primary btn-workbench" type="button" @click="$emit('workbench', { device, proc, target })">打开诊断</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </article>
</template>

<script setup>
import { computed } from 'vue';
import { identifyProject } from '@/shared/composables/useProjectIdentify.js';

const props = defineProps({
    device: { type: Object, required: true }
});
defineEmits(['workbench']);

const statusText = computed(() => props.device.status === 'device' ? '在线' : (props.device.status || 'unknown'));
const metaText = computed(() => [
    props.device.id,
    props.device.manufacturer,
    props.device.androidVersion ? `Android ${props.device.androidVersion}` : '',
    props.device.sdkVersion ? `SDK ${props.device.sdkVersion}` : ''
].filter(Boolean).join(' · '));

function visibleTargets(proc) {
    return (proc.targets || []).filter(t =>
        (t.type === 'page' || t.type === 'webview') && (t.url || t.title)
    );
}

function profileFor(target) {
    return identifyProject(target.url);
}
</script>
