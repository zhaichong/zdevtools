<script setup>
defineProps({
    activePanel: { type: String, default: 'diagnosis' },
    counts: { type: Object, default: () => ({}) }
});
defineEmits(['select-panel']);

const panels = [
    { id: 'diagnosis', label: '诊断', icon: 'Dx', title: '根因聚合与修复线索', countKey: 'causes' },
    { id: 'timeline', label: '时间轴', icon: 'Tl', title: '错误前后的行为、请求、日志证据链', countKey: 'timeline' },
    { id: 'replay', label: '回放', icon: 'Rv', title: '用户操作场景回放' },
    { id: 'device', label: '设备', icon: 'Dv', title: '设备、WebView、Bridge 与运行环境' },
    { id: 'logs', label: 'logcat', icon: 'Lg', title: 'Android 与 WebView 相关日志', countKey: 'logcat' },
    { id: 'report', label: '报告', icon: 'Rp', title: '复制和导出排查证据' },
    { id: 'devtools', label: 'DevTools', icon: 'DT', title: 'Chrome DevTools 深度检查' }
];
</script>

<template>
    <nav class="rail-nav" aria-label="Panel navigation">
        <button
            v-for="panel in panels"
            :key="panel.id"
            class="rail-item"
            :class="{ active: activePanel === panel.id }"
            :title="panel.title"
            type="button"
            @click="$emit('select-panel', panel.id)"
        >
            <span class="rail-icon">{{ panel.icon }}</span>
            <span class="rail-label">{{ panel.label }}</span>
            <small v-if="panel.countKey && counts[panel.countKey]" class="rail-count">{{ counts[panel.countKey] }}</small>
        </button>
    </nav>
</template>

<style scoped>
.rail-nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 8px;
    width: 80px;
    background: var(--panel-soft);
    border-right: 1px solid var(--border);
    overflow-y: auto;
}
.rail-item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 4px;
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    border-radius: 8px;
    font-size: 11px;
    transition: background-color 0.15s ease, color 0.15s ease;
}
.rail-item:hover {
    background: var(--panel);
    color: var(--text);
}
.rail-item.active {
    background: var(--panel-strong);
    color: var(--accent);
    font-weight: 600;
}
.rail-icon {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 1px solid currentColor;
    font-size: 10px;
    line-height: 1;
    font-family: Consolas, "Cascadia Mono", monospace;
}
.rail-label {
    font-size: 11px;
    white-space: nowrap;
}
.rail-count {
    position: absolute;
    top: 4px;
    right: 8px;
    background: var(--danger);
    color: #fff;
    border-radius: 10px;
    padding: 0 5px;
    font-size: 9px;
    font-weight: 700;
}
</style>
