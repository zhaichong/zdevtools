<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { highlightText } from '@/shared/utils/highlight.js';

const props = defineProps({
    entries: { type: Array, default: () => [] },
    filteredEntries: { type: Array, default: () => [] },
    searchText: { type: String, default: '' },
    filterLevel: { type: String, default: 'all' },
    paused: { type: Boolean, default: false },
    autoScroll: { type: Boolean, default: true },
    matchIndex: { type: Number, default: 0 },
    matchCount: { type: Number, default: 0 },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    levelLabels: { type: Object, default: () => ({}) }
});

const emit = defineEmits([
    'update:searchText', 'update:search-text', 'update:filterLevel', 'update:filter-level',
    'toggle-pause', 'toggle-auto-scroll',
    'clear', 'next-match', 'prev-match', 'refresh'
]);

const scrollerRef = ref(null);
const userScrolled = ref(false);

const displayEntries = computed(() => props.filteredEntries);
const errorCount = computed(() => props.entries.filter(entry => entry.level === 'E' || entry.level === 'F').length);
const warningCount = computed(() => props.entries.filter(entry => entry.level === 'W').length);
const currentMatchId = computed(() => {
    if (!props.searchText || props.matchCount === 0) return null;
    return props.filteredEntries[Math.min(props.matchIndex, props.matchCount - 1)]?.id || null;
});

function renderMessage(entry) {
    const text = entry.parsed ? entry.message : entry.raw;
    return highlightText(text, props.searchText || '');
}

function updateSearch(value) {
    emit('update:searchText', value);
    emit('update:search-text', value);
}

function updateFilter(value) {
    emit('update:filterLevel', value);
    emit('update:filter-level', value);
}

function levelClass(level) {
    return ({ V: 'level-v', D: 'level-d', I: 'level-i', W: 'level-w', E: 'level-e', F: 'level-f' })[level] || '';
}

function onScroll(event) {
    if (!props.autoScroll) return;
    const el = event.target;
    userScrolled.value = el.scrollHeight - el.scrollTop - el.clientHeight > 40;
}

function scrollToBottom() {
    const el = scrollerRef.value?.$el;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    userScrolled.value = false;
}

watch(displayEntries, async () => {
    if (!props.autoScroll || props.paused || userScrolled.value) return;
    await nextTick();
    scrollToBottom();
});
</script>

<template>
    <div class="logcat-page">
        <header class="workflow-header">
            <div>
                <h2>logcat</h2>
                <p>只看 Android WebView、Chromium 和业务相关日志。</p>
            </div>
            <div class="logcat-stats">
                <span>{{ entries.length.toLocaleString() }} 行</span>
                <span class="warn">{{ warningCount }} 警告</span>
                <span class="bad">{{ errorCount }} 错误</span>
            </div>
        </header>

        <div class="logcat-toolbar">
            <button class="btn secondary" type="button" @click="emit('toggle-pause')">{{ paused ? '继续' : '暂停' }}</button>
            <button class="btn secondary" type="button" @click="emit('clear')">清空</button>
            <input
                type="text"
                :value="searchText"
                placeholder="搜索 tag、关键字或错误..."
                @input="updateSearch($event.target.value)"
            />
            <select :value="filterLevel" @change="updateFilter($event.target.value)">
                <option value="all">全部级别</option>
                <option v-for="(label, key) in levelLabels" :key="key" :value="key">{{ label }} ({{ key }})</option>
            </select>
            <button class="btn secondary" type="button" @click="emit('toggle-auto-scroll')">{{ autoScroll ? '自动滚动' : '手动滚动' }}</button>
            <button class="btn secondary" type="button" @click="emit('refresh')">刷新</button>
        </div>

        <div v-if="loading" class="logcat-state">正在获取 logcat 日志...</div>
        <div v-else-if="error" class="logcat-state error">{{ error }}</div>
        <div v-else-if="!displayEntries.length" class="logcat-state">暂无匹配日志。</div>

        <DynamicScroller
            v-else
            ref="scrollerRef"
            class="log-scroller"
            :items="displayEntries"
            :min-item-size="32"
            key-field="id"
            :buffer="600"
            @scroll="onScroll"
        >
            <template #default="{ item: entry, active }">
                <DynamicScrollerItem
                    :item="entry"
                    :active="active"
                    :size-dependencies="[entry.raw, entry.message, searchText]"
                >
                    <div
                        class="log-row"
                        :class="{
                            'current-match': currentMatchId === entry.id,
                            'log-row-error': entry.level === 'E' || entry.level === 'F',
                            'log-row-warning': entry.level === 'W'
                        }"
                    >
                        <template v-if="entry.parsed">
                            <span class="log-time">{{ entry.timestamp }}</span>
                            <span class="level-badge" :class="levelClass(entry.level)">{{ entry.level }}</span>
                            <span class="log-tag" :title="entry.tag">{{ entry.tag }}</span>
                            <span class="log-message" v-html="renderMessage(entry)"></span>
                        </template>
                        <span v-else class="log-message raw" v-html="renderMessage(entry)"></span>
                    </div>
                </DynamicScrollerItem>
            </template>
        </DynamicScroller>
    </div>
</template>

<style scoped>
.logcat-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    overflow: hidden;
    background: #f8fafc;
}

.logcat-stats {
    display: flex;
    gap: 8px;
}

.logcat-stats span {
    border: 1px solid #dbe3ef;
    border-radius: 999px;
    padding: 5px 10px;
    background: #fff;
    color: #475569;
    font-size: 12px;
    font-weight: 700;
}

.logcat-stats .warn { color: #b45309; }
.logcat-stats .bad { color: #b91c1c; }

.logcat-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #dbe3ef;
    border-radius: 8px;
    padding: 8px;
    background: #fff;
}

.logcat-toolbar input,
.logcat-toolbar select {
    border: 1px solid #dbe3ef;
    border-radius: 8px;
    padding: 7px 9px;
    background: #fff;
    color: #111827;
    font-size: 13px;
    outline: none;
}

.logcat-toolbar input {
    flex: 1;
    min-width: 180px;
}

.logcat-state {
    flex: 1;
    display: grid;
    place-items: center;
    border: 1px solid #dbe3ef;
    border-radius: 8px;
    background: #fff;
    color: #64748b;
}

.logcat-state.error {
    color: #b91c1c;
}

.log-scroller {
    flex: 1;
    min-height: 0;
    border: 1px solid #dbe3ef;
    border-radius: 8px;
    background: #fff;
    font-family: Consolas, "Cascadia Mono", monospace;
    font-size: 12px;
}

.log-row {
    min-height: 32px;
    display: grid;
    grid-template-columns: 138px 34px 150px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    padding: 7px 10px;
    border-bottom: 1px solid #edf2f7;
    line-height: 1.45;
}

.log-message,
.log-tag,
.log-time {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.log-message {
    overflow: visible;
    text-overflow: clip;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.log-time { color: #64748b; }
.log-tag { color: #111827; }
.log-message { color: #334155; }
.log-message.raw { grid-column: 1 / -1; }

.level-badge {
    border-radius: 4px;
    text-align: center;
    font-weight: 800;
}

.level-v { color: #64748b; }
.level-d { color: #2563eb; }
.level-i { color: #15803d; }
.level-w { background: #fffbeb; color: #b45309; }
.level-e,
.level-f { background: #fef2f2; color: #b91c1c; }

.log-row-error { background: #fff7f7; }
.log-row-warning { background: #fffbeb; }
.log-row.current-match { outline: 1px solid #2563eb; background: #eff6ff; }

:deep(mark.hl) {
    border-radius: 2px;
    background: #bfdbfe;
    color: #1e3a8a;
}
</style>
