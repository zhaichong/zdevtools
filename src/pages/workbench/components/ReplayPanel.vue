<script setup>
defineProps({
    breadcrumbs: { type: Array, default: () => [] }
});
defineEmits(['open-replay']);
</script>

<template>
    <div class="workflow-panel replay-panel">
        <header class="workflow-header">
            <div>
                <h2>回放</h2>
                <p>查看错误前后的真实操作画面，完整回放由 rrweb 提供。</p>
            </div>
            <button class="btn primary" type="button" @click="$emit('open-replay')">打开回放</button>
        </header>

        <section class="replay-overview">
            <div class="replay-preview">
                <strong>rrweb</strong>
                <span>打开播放器，查看录制画面、操作轨迹和错误前状态。</span>
            </div>
            <div class="replay-summary">
                <h3>错误前操作</h3>
                <div v-if="!breadcrumbs.length" class="empty-mini">暂无操作面包屑。</div>
                <div v-for="(item, index) in breadcrumbs.slice(-16).reverse()" :key="index" class="workflow-row">
                    <span>{{ item.type || 'event' }}</span>
                    <strong>{{ item.message || item.title || '-' }}</strong>
                </div>
            </div>
        </section>
    </div>
</template>
