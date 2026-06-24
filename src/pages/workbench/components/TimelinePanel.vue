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
</script>

<template>
    <div class="timeline-page">
        <header class="workflow-header">
            <div>
                <h2>时间轴</h2>
                <p>按发生顺序串联点击、路由、接口、console、异常和 logcat。</p>
            </div>
            <div class="timeline-stats">
                <span>{{ normalized.length }} 事件</span>
                <span>{{ errorCount }} 关键</span>
            </div>
        </header>

        <div v-if="!normalized.length" class="empty-mini">暂无时间轴事件。复现问题后会自动出现。</div>
        <div v-else class="timeline-layout">
            <ol class="trace-list">
                <li
                    v-for="(item, index) in normalized"
                    :key="`${item.time}-${index}`"
                    :class="[{ active: selectedIndex === index }, item.type]"
                    @click="selectedIndex = index"
                >
                    <time>{{ formatTime(item.time) }}</time>
                    <strong>{{ typeLabel(item.type) }}</strong>
                    <span>{{ redact(item.message) }}</span>
                </li>
            </ol>
            <aside class="workflow-detail">
                <template v-if="selected">
                    <div class="detail-kicker">{{ typeLabel(selected.type) }}</div>
                    <h3>{{ redact(selected.message) || '事件详情' }}</h3>
                    <dl>
                        <div><dt>时间</dt><dd>{{ formatTime(selected.time) }}</dd></div>
                        <div><dt>类型</dt><dd>{{ typeLabel(selected.type) }}</dd></div>
                    </dl>
                    <pre>{{ selectedRawText }}</pre>
                </template>
            </aside>
        </div>
    </div>
</template>
