<script setup>
import { computed, ref } from 'vue';
import { redact } from '@/shared/utils/redact.js';

const props = defineProps({
    report: { type: Object, default: null },
    markdown: { type: String, default: '' }
});
const emit = defineEmits(['copy-markdown']);

const tab = ref('short');
const jsonText = computed(() => {
    try {
        return redact(JSON.stringify(props.report || {}, null, 2));
    } catch {
        return '报告无法序列化。';
    }
});
const shortText = computed(() => {
    const cause = props.report?.causes?.[0];
    if (!cause) return '暂无诊断结论。';
    return [
        `根因：${cause.priority || 'INFO'} ${redact(cause.title || '-')}`,
        `摘要：${redact(cause.summary || '-')}`,
        `下一步：${redact(cause.next || '-')}`,
        `页面：${redact(props.report?.snapshot?.href || props.report?.target?.url || '-')}`
    ].join('\n');
});
</script>

<template>
    <div class="report-page">
        <header class="workflow-header">
            <div>
                <h2>报告</h2>
                <p>默认脱敏，生成给业务前端、排查留档或 AI 分析用的证据包。</p>
            </div>
            <div class="report-actions">
                <span class="redaction-pill">脱敏已开启</span>
                <button class="btn primary" type="button" @click="emit('copy-markdown')">复制报告</button>
            </div>
        </header>

        <div class="report-tabs">
            <button :class="{ active: tab === 'short' }" type="button" @click="tab = 'short'">短报告</button>
            <button :class="{ active: tab === 'long' }" type="button" @click="tab = 'long'">长报告</button>
            <button :class="{ active: tab === 'json' }" type="button" @click="tab = 'json'">JSON</button>
        </div>

        <pre v-if="tab === 'short'" class="report-preview">{{ shortText }}</pre>
        <pre v-else-if="tab === 'long'" class="report-preview">{{ markdown || '暂无报告。' }}</pre>
        <pre v-else class="report-preview">{{ jsonText }}</pre>
    </div>
</template>
