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
    levelLabels: { type: Object, default: () => ({}) },
    stats: { type: Object, default: () => ({ total: 0, warning: 0, error: 0, fatal: 0 }) }
});

const emit = defineEmits([
    'update:searchText', 'update:search-text', 'update:filterLevel', 'update:filter-level',
    'toggle-pause', 'toggle-auto-scroll',
    'clear', 'next-match', 'prev-match', 'refresh'
]);

const scrollerRef = ref(null);
const userScrolled = ref(false);

const displayEntries = computed(() => props.filteredEntries);
// 使用 useLogcat 的 O(1) stats 计数器代替遍历 50000 条
const errorCount = computed(() => props.stats.error + props.stats.fatal);
const warningCount = computed(() => props.stats.warning);
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
    <div class="flex flex-col h-full bg-white text-zinc-800 p-4 overflow-hidden gap-4">
        <!-- Header -->
        <header class="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-200 pb-3 select-none">
            <div>
                <h2 class="text-sm font-bold text-zinc-800 flex items-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-violet-600"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                    Logcat 日志控制台
                </h2>
                <p class="text-xs text-zinc-400 mt-1">只看 Android WebView、Chromium 和业务相关日志</p>
            </div>
            <div class="flex items-center gap-3 mt-3 md:mt-0">
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-zinc-200 bg-white text-xs font-medium text-zinc-500 shadow-sm">
                    <span>{{ entries.length.toLocaleString() }} 行</span>
                </div>
                <div v-if="warningCount > 0" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-700 shadow-sm">
                    <span>{{ warningCount }} 警告</span>
                </div>
                <div v-if="errorCount > 0" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-red-200 bg-red-50 text-xs font-semibold text-red-700 shadow-sm">
                    <span>{{ errorCount }} 错误</span>
                </div>
            </div>
        </header>

        <!-- Toolbar -->
        <div class="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-zinc-200 bg-white shadow-2xs select-none">
            <button class="px-3 py-1.5 text-xs font-semibold rounded border border-zinc-200 text-zinc-600 bg-white hover:bg-zinc-50 hover:text-zinc-950 transition-colors cursor-pointer outline-none" type="button" @click="emit('toggle-pause')">
                {{ paused ? '▶ 继续' : '⏸ 暂停' }}
            </button>
            <button class="px-3 py-1.5 text-xs font-semibold rounded border border-zinc-200 text-zinc-600 bg-white hover:bg-zinc-50 hover:text-zinc-950 transition-colors cursor-pointer outline-none" type="button" @click="emit('clear')">
                清空
            </button>
            <div class="flex-1 relative min-w-[200px]">
                <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <svg class="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <input
                    type="text"
                    :value="searchText"
                    placeholder="搜索 tag、关键字或错误..."
                    class="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-zinc-200 rounded text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-150"
                    @input="updateSearch($event.target.value)"
                />
            </div>
            <select :value="filterLevel" @change="updateFilter($event.target.value)" class="px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded text-zinc-600 focus:outline-none focus:border-violet-500 cursor-pointer font-medium">
                <option value="all">全部级别</option>
                <option v-for="(label, key) in levelLabels" :key="key" :value="key">{{ label }} ({{ key }})</option>
            </select>
            <button class="px-3 py-1.5 text-xs font-semibold rounded border border-zinc-200 text-zinc-600 bg-white hover:bg-zinc-50 hover:text-zinc-950 transition-colors cursor-pointer outline-none" type="button" @click="emit('toggle-auto-scroll')">
                {{ autoScroll ? '滚动: 开' : '滚动: 关' }}
            </button>
            <button class="px-3 py-1.5 text-xs font-semibold rounded border border-zinc-200 text-zinc-600 bg-white hover:bg-zinc-50 hover:text-zinc-950 transition-colors cursor-pointer outline-none" type="button" @click="emit('refresh')">
                刷新
            </button>
        </div>

        <div v-if="error && entries.length" class="shrink-0 px-3 py-2 rounded-lg border border-orange-200 bg-orange-50 text-xs text-orange-800">
            {{ error }}
        </div>

        <!-- Content Area -->
        <div v-if="loading && !entries.length" class="flex-1 grid place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 text-sm">
            <div class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4 text-accent" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                正在获取 logcat 日志...
            </div>
        </div>
        <div v-else-if="error && !entries.length" class="flex-1 grid place-items-center rounded-lg border border-danger/20 bg-danger/5 text-danger text-sm p-4 text-center">
            {{ error }}
        </div>
        <div v-else-if="!displayEntries.length" class="flex-1 grid place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 text-sm">
            暂无匹配日志。
        </div>

        <!-- Scroller -->
        <div v-else class="flex-1 min-h-0 relative rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden font-mono text-xs leading-relaxed">
            <!-- Header Row for Log Table -->
            <div class="grid grid-cols-[130px_40px_160px_1fr] gap-3 px-3 py-1.5 border-b border-zinc-200 bg-zinc-50 text-zinc-500 font-semibold tracking-wider sticky top-0 z-10 text-[10px] uppercase">
                <div>Time</div>
                <div class="text-center">Lvl</div>
                <div>Tag</div>
                <div>Message</div>
            </div>

            <DynamicScroller
                ref="scrollerRef"
                class="absolute inset-0 top-[29px] custom-scrollbar"
                :items="displayEntries"
                :min-item-size="28"
                key-field="id"
                :buffer="300"
                @scroll="onScroll"
            >
                <template #default="{ item: entry, index, active }">
                    <DynamicScrollerItem :item="entry" :active="active" :data-index="index">
                        <div
                            class="grid grid-cols-[130px_40px_160px_1fr] gap-3 px-3 py-1.5 border-b border-zinc-100 hover:bg-zinc-50 transition-colors items-start group"
                            :class="{
                                'bg-accent/5 border-l-2 border-l-accent': currentMatchId === entry.id,
                                'bg-danger/5 hover:bg-danger/10 border-b-danger/10': entry.level === 'E' || entry.level === 'F',
                                'bg-warning/5 hover:bg-warning/10 border-b-warning/10': entry.level === 'W'
                            }"
                        >
                            <template v-if="entry.parsed">
                                <span class="text-zinc-500 truncate whitespace-nowrap">{{ entry.timestamp }}</span>
                                <div class="flex justify-center">
                                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold leading-none inline-flex items-center justify-center"
                                        :class="{
                                            'bg-zinc-100 text-zinc-500': entry.level === 'V',
                                            'bg-info/10 text-info': entry.level === 'D',
                                            'bg-success/20 text-success': entry.level === 'I',
                                            'bg-warning/20 text-warning': entry.level === 'W',
                                            'bg-danger/20 text-danger': entry.level === 'E' || entry.level === 'F'
                                        }"
                                    >
                                        {{ entry.level }}
                                    </span>
                                </div>
                                <span class="text-zinc-600 truncate whitespace-nowrap" :title="entry.tag">{{ entry.tag }}</span>
                                <span class="whitespace-pre-wrap break-words text-zinc-800 group-hover:text-zinc-900 transition-colors" 
                                      :class="{ 'text-danger': entry.level === 'E' || entry.level === 'F', 'text-warning': entry.level === 'W' }"
                                      v-html="renderMessage(entry)"></span>
                            </template>
                            <span v-else class="col-span-4 whitespace-pre-wrap break-words text-zinc-600" v-html="renderMessage(entry)"></span>
                        </div>
                    </DynamicScrollerItem>
                </template>
            </DynamicScroller>
        </div>
    </div>
</template>

<style scoped>
:deep(mark.hl) {
    border-radius: 2px;
    background-color: rgba(139, 92, 246, 0.2); /* accent/20 */
    color: #6d28d9; /* accent dark */
    padding: 0 2px;
}
.custom-scrollbar::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: #d4d4d8;
    border-radius: 4px;
    border: 2px solid #ffffff;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #a1a1aa;
}
</style>
