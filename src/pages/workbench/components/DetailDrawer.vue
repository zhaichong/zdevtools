<script setup>
import { computed } from 'vue';
import { formatTime } from '@/shared/utils/format.js';
import CauseDetail from './CauseDetail.vue';
import CauseList from './CauseList.vue';
import TimelineView from './TimelineView.vue';
import SourcePanel from './SourcePanel.vue';

const props = defineProps({
    open: { type: Boolean, default: true },
    cause: { type: Object, default: null },
    causes: { type: Array, default: () => [] },
    report: { type: Object, default: null },
    activeView: { type: String, default: 'causes' },
    breadcrumbs: { type: Array, default: () => [] },
    logcatLines: { type: Array, default: () => [] },
    sourceStats: { type: Object, default: () => ({ uploaded: 0, matched: 0 }) },
    onEvaluate: { type: Function, default: null }
});
defineEmits(['toggle', 'refresh', 'copy-cause', 'select-cause']);

const drawerTitle = computed(() => {
    if (!props.cause) return '等待根因分析';
    return `${props.cause.priority || ''} ${props.cause.title}`;
});

const drawerSubtitle = computed(() => {
    if (!props.cause) return '复现问题后会自动聚合 Console、Network、Bridge 和 SourceMap 线索。';
    return `${props.cause.owner} · ${props.cause.count} 次 · ${formatTime(props.cause.lastSeen)}`;
});

</script>

<template>
    <div class="diagnosis-panel">
        <div class="diagnosis-sidebar">
            <div class="sidebar-header">
                <strong>捕获的异常</strong>
                <span class="badge">{{ causes.length }}</span>
            </div>
            <div class="cause-nav-list">
                <div v-for="c in causes" :key="c.id" 
                     class="cause-nav-item" 
                     :class="[c.priority ? c.priority.toLowerCase() : 'info', { active: cause?.id === c.id }]"
                     @click="$emit('select-cause', c.id)">
                    <span class="p-badge">{{ c.priority || 'INFO' }}</span>
                    <span class="c-title" :title="c.title">{{ c.title }}</span>
                </div>
            </div>
        </div>
        <div class="diagnosis-main">
            <div class="panel-handle">
                <div class="handle-info">
                    <strong>{{ drawerTitle }}</strong>
                    <span>{{ drawerSubtitle }}</span>
                </div>
                <div class="handle-actions">
                    <button class="btn secondary" type="button" @click="$emit('copy-cause')">复制定位</button>
                    <button class="btn primary" type="button" @click="$emit('refresh')">重新采集</button>
                </div>
            </div>
            <div class="panel-content">
                <template v-if="!cause">
                    <div class="empty-mini">暂无诊断结果。等待采集数据后自动分析。</div>
                </template>
                <template v-else>
                    <CauseDetail :cause="cause" :on-evaluate="onEvaluate" />
                </template>
            </div>
        </div>
    </div>
</template>

<style scoped>
.diagnosis-panel { 
    display: flex; 
    height: 100%; 
    background: var(--bg); 
}
.diagnosis-sidebar { 
    width: 280px; 
    border-right: 1px solid var(--border); 
    display: flex; 
    flex-direction: column; 
    background: var(--panel-soft);
}
.sidebar-header {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.sidebar-header strong { font-size: 14px; color: var(--text); }
.sidebar-header .badge { 
    background: var(--border-strong); 
    color: var(--text);
    padding: 2px 8px; 
    border-radius: 12px; 
    font-size: 12px; 
}
.cause-nav-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.cause-nav-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    background: var(--panel);
    transition: all 0.2s;
}
.cause-nav-item:hover {
    border-color: var(--border-strong);
}
.cause-nav-item.active {
    background: var(--panel-strong);
    border-color: var(--accent);
}
.cause-nav-item .p-badge {
    font-size: 11px;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--border);
    flex-shrink: 0;
}
.cause-nav-item.p0 .p-badge { background: var(--danger-bg); color: var(--danger); }
.cause-nav-item.p1 .p-badge { background: var(--warning-bg); color: var(--warning); }

.c-title {
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: break-all;
}

.diagnosis-main { 
    flex: 1; 
    display: flex; 
    flex-direction: column; 
    min-width: 0;
}
.panel-handle { 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    padding: 16px 20px; 
    border-bottom: 1px solid var(--border); 
    gap: 16px; 
    background: var(--panel-strong);
}
.handle-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.handle-info strong { 
    font-size: 16px; 
    color: var(--text); 
    overflow: hidden; 
    text-overflow: ellipsis; 
    white-space: nowrap; 
}
.handle-info span { font-size: 12px; color: var(--muted); }
.handle-actions { display: flex; gap: 8px; flex-shrink: 0; }
.panel-content { flex: 1; overflow: auto; padding: 20px; background: var(--panel); }
</style>
