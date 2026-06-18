<script setup>
defineProps({
    activePanel: { type: String, default: 'network' },
    counts: { type: Object, default: () => ({}) }
});
defineEmits(['select-panel']);

const panels = [
    { id: 'network', label: 'Network', icon: '⇄', title: 'Real-time network requests' },
    { id: 'console', label: 'Console', icon: '>', title: 'Real-time console output' },
    { id: 'devtools', label: 'DevTools', icon: '⚙', title: 'Chrome DevTools (deep inspection)' },
    { id: 'logs', label: 'Logs', icon: '≡', title: 'Android logcat' },
    { id: 'device', label: 'Device', icon: '▣', title: 'Device & bridge info' },
    { id: 'diagnosis', label: 'Diagnosis', icon: '◉', title: 'Root cause analysis (Sentry-style)' }
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
            <small v-if="panel.id === 'diagnosis' && counts.causes" class="rail-count">{{ counts.causes }}</small>
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
    transition: all 0.2s ease; 
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
    font-size: 18px; 
    line-height: 1; 
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
