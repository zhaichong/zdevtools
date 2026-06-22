<script setup>
defineProps({ stack: { type: Array, default: () => [] } });
</script>

<template>
    <div v-if="stack?.length" class="stack-list">
        <div v-for="(frame, i) in stack.slice(0, 20)" :key="i" class="stack-row">
            <span class="stack-fn">{{ frame.functionName || '(anonymous)' }}</span>
            <span class="stack-loc">{{ frame.url || '' }}:{{ frame.lineNumber || '' }}</span>
        </div>
    </div>
    <div v-else class="empty-mini">无堆栈。</div>
</template>

<style scoped>
.stack-list { display: flex; flex-direction: column; gap: 4px; }
.stack-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 4px 8px; background: var(--panel-strong); border-radius: 4px; font-size: 11px; font-family: monospace; }
.stack-fn { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
.stack-loc { color: var(--accent); overflow: hidden; text-overflow: ellipsis; text-align: right; }
</style>
