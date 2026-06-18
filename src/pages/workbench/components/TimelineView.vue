<script setup>
import { formatTime } from '@/shared/utils/format.js';
import { redact } from '@/shared/utils/redact.js';

defineProps({ items: { type: Array, default: () => [] } });

const TYPE_LABELS = {
    network: '接口', js: 'JS', vue: 'Vue', resource: '资源',
    bridge: 'Bridge', route: '路由', click: '点击',
    console: 'Console', probe: '探针', 'low-signal': '低价值线索'
};
function typeLabel(type) { return TYPE_LABELS[type] || type || '事件'; }
</script>

<template>
    <div v-if="items?.length" class="timeline-list">
        <div v-for="(item, i) in items.slice(-80).reverse()" :key="i" class="timeline-item">
            <time>{{ formatTime(item.time) }}</time>
            <span><strong>{{ typeLabel(item.type) }}</strong> {{ redact(item.message || '') }}</span>
        </div>
    </div>
    <div v-else class="empty-mini">暂无时间线事件。</div>
</template>
