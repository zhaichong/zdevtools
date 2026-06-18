<script setup>
import { redact } from '@/shared/utils/redact.js';

defineProps({ causes: { type: Array, default: () => [] } });
defineEmits(['select-cause']);

function severityClass(priority) {
    if (priority === 'P0') return 'danger';
    if (priority === 'P1' || priority === 'P2') return 'warning';
    return 'info';
}
</script>

<template>
    <div v-if="causes.length">
        <button v-for="cause in causes" :key="cause.id" class="cause-panel" :class="severityClass(cause.priority)" type="button" @click="$emit('select-cause', cause.id)">
            <h3>{{ cause.priority }} {{ cause.title }} · {{ cause.count }} 次</h3>
            <p><strong>原因：</strong>{{ redact(cause.summary) }}</p>
            <p><strong>下一步：</strong>{{ redact(cause.next) }}</p>
        </button>
    </div>
    <div v-else class="empty-mini">当前分类没有根因。</div>
</template>

<style scoped>
.cause-panel { margin-bottom: 10px; text-align: left; width: 100%; cursor: pointer; }
</style>
