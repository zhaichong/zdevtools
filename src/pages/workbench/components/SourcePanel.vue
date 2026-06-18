<script setup>
defineProps({ causes: { type: Array, default: () => [] }, sourceStats: { type: Object, default: () => ({}) } });
</script>

<template>
    <div>
        <p>上传: {{ sourceStats.uploaded || 0 }} 个, 匹配: {{ sourceStats.matched || 0 }} 个根因</p>
        <div v-if="!causes.length" class="empty-mini">暂无根因。</div>
        <div v-for="cause in causes" :key="cause.id" style="margin-bottom: 8px; padding: 8px; background: #111; border-radius: 4px; font-size: 12px;">
            <strong>{{ cause.priority }} {{ cause.title }}</strong>
            <div v-if="cause.source?.mode === 'source-map'" style="color: #6ee7b7; margin-top: 4px;">
                ✓ {{ cause.source.source }}:{{ cause.source.line }}:{{ cause.source.column }}
            </div>
            <div v-else style="color: #fca5a5; margin-top: 4px;">✗ {{ cause.source?.reason || '未匹配' }}</div>
        </div>
    </div>
</template>
