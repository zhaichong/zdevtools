<script setup>
import { computed } from 'vue';
import { formatTime } from '@/shared/utils/format.js';
import CauseDetail from './CauseDetail.vue';

const props = defineProps({
    cause: { type: Object, default: null },
    causes: { type: Array, default: () => [] },
    onEvaluate: { type: Function, default: null }
});
defineEmits(['refresh', 'copy-cause', 'select-cause']);

const topCause = computed(() => props.causes[0] || null);
</script>

<template>
    <div class="diagnosis-panel">
        <aside class="diagnosis-sidebar">
            <header class="sidebar-header">
                <div>
                    <strong>诊断</strong>
                    <span>{{ causes.length }} 个根因</span>
                </div>
                <button class="btn ghost" type="button" @click="$emit('refresh')">刷新</button>
            </header>

            <div v-if="!causes.length" class="diagnosis-empty">
                复现问题后会自动聚合 JS、接口、Bridge、资源和 logcat 线索。
            </div>

            <button
                v-for="item in causes"
                :key="item.id"
                class="cause-nav-item"
                :class="[(item.priority || 'info').toLowerCase(), { active: cause?.id === item.id }]"
                type="button"
                @click="$emit('select-cause', item.id)"
            >
                <span class="p-badge">{{ item.priority || 'INFO' }}</span>
                <span class="c-title">{{ item.title }}</span>
                <small>{{ item.count || 1 }} 次 · {{ formatTime(item.lastSeen) }}</small>
            </button>
        </aside>

        <main class="diagnosis-main">
            <header class="diagnosis-toolbar">
                <div>
                    <h2>{{ cause?.title || topCause?.title || '等待诊断结果' }}</h2>
                    <p>{{ cause ? `${cause.owner || '-'} · ${cause.count || 1} 次` : '采集后会展示最可能的根因和证据链。' }}</p>
                </div>
                <button class="btn primary" type="button" :disabled="!cause" @click="$emit('copy-cause')">复制定位</button>
            </header>

            <section class="diagnosis-content">
                <CauseDetail v-if="cause" :cause="cause" :on-evaluate="onEvaluate" />
                <div v-else class="empty-mini">暂无诊断结果。</div>
            </section>
        </main>
    </div>
</template>
