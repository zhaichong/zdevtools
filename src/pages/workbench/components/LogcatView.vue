<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { RecycleScroller } from 'vue-virtual-scroller';
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
    'update:searchText', 'update:filterLevel',
    'toggle-pause', 'toggle-auto-scroll',
    'clear', 'next-match', 'prev-match', 'refresh'
]);

// ========== RecycleScroller 引用 & 用户滚动状态 ==========
const scrollerRef = ref(null);
const userScrolled = ref(false);

// ========== 展示数据源 ==========
const displayEntries = computed(() => {
    if (props.searchText || props.filterLevel !== 'all') {
        return props.filteredEntries;
    }
    return props.entries;
});

const totalCount = computed(() => displayEntries.value.length);

// ========== 渲染辅助 ==========
function renderMessage(entry) {
    if (props.searchText) {
        return highlightText(entry.message, props.searchText);
    }
    return highlightText(entry.message, '');
}

/**
 * 当前匹配条目 id（用于高亮当前匹配行）
 */
const currentMatchId = computed(() => {
    if (!props.searchText || props.matchCount === 0) return null;
    const idx = Math.min(props.matchIndex, props.matchCount - 1);
    const entry = props.filteredEntries[idx];
    return entry ? entry.id : null;
});

function isCurrentMatch(entryId) {
    return currentMatchId.value === entryId;
}

function levelClass(level) {
    const map = {
        V: 'level-v', D: 'level-d', I: 'level-i',
        W: 'level-w', E: 'level-e', F: 'level-f'
    };
    return map[level] || '';
}

// ========== 滚动事件 ==========
function onScroll(e) {
    const el = e.target;
    // 判断用户是否手动滚离底部（阈值 40px）
    if (props.autoScroll) {
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        userScrolled.value = distFromBottom > 40;
    }
}

// ========== 自动滚动到底部 ==========
function scrollToBottom() {
    const el = scrollerRef.value?.$el;
    if (el) {
        el.scrollTop = el.scrollHeight;
        userScrolled.value = false;
    }
}

// 新日志到达时自动滚底（pause 或 用户手动滚离底部 时跳过）
watch(() => props.entries.length, async () => {
    if (!props.autoScroll) return;
    if (props.paused) return;
    if (userScrolled.value) return;
    await nextTick();
    scrollToBottom();
});

// ========== 匹配导航：滚动到当前匹配行 ==========
watch(() => props.matchIndex, async () => {
    if (!props.searchText || props.matchCount === 0) return;
    await nextTick();
    const entry = props.filteredEntries[props.matchIndex];
    if (!entry) return;
    const idxInDisplay = displayEntries.value.findIndex(e => e.id === entry.id);
    if (idxInDisplay === -1) return;
    const el = scrollerRef.value?.$el;
    if (el) {
        el.scrollTop = Math.max(0, idxInDisplay * 24 - el.clientHeight / 2);
    }
});

// 搜索文本变化时自动滚动也重置用户滚动状态
watch(() => props.searchText, () => {
    userScrolled.value = false;
});

onBeforeUnmount(() => {});
</script>

<template>
  <div class="flex flex-col h-full bg-bg-base overflow-hidden text-sm">
    <!-- ====== Toolbar ====== -->
    <div class="flex items-center gap-2 px-3 py-2 border-b border-border-base bg-bg-layer flex-none flex-wrap">
      <!-- 清空 -->
      <button
        @click="emit('clear')"
        class="px-2 py-1 rounded bg-panel-soft hover:bg-border text-muted text-xs flex-none"
        title="清空所有日志"
      >🚫 清空</button>

      <!-- 暂停 -->
      <button
        @click="emit('toggle-pause')"
        class="px-2 py-1 rounded text-xs flex-none"
        :class="paused ? 'bg-accent-subtle text-accent' : 'bg-panel-soft hover:bg-border text-muted'"
        :title="paused ? '已暂停，点击恢复' : '暂停日志更新'"
      >{{ paused ? '▶ 继续' : '⏸ 暂停' }}</button>

      <div class="h-4 w-px bg-border flex-none"></div>

      <!-- 搜索框 -->
      <div class="relative flex-1 min-w-[140px] max-w-[300px]">
        <input
          type="text"
          :value="searchText"
          @input="emit('update:searchText', $event.target.value)"
          placeholder="搜索日志..."
          class="w-full bg-bg-base border border-border-base rounded-md px-2.5 py-1 text-xs text-text-primary placeholder-text-disabled outline-none focus:border-accent"
        />
        <span
          v-if="searchText"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-text-tertiary pointer-events-none"
        >{{ matchCount }} 匹配</span>
      </div>

      <!-- 匹配导航 -->
      <template v-if="searchText && matchCount > 0">
        <span class="text-2xs text-text-tertiary flex-none">
          {{ Math.min(matchIndex + 1, matchCount) }}/{{ matchCount }}
        </span>
        <button
          @click="emit('prev-match')"
          class="px-1.5 py-0.5 rounded bg-panel-soft hover:bg-border text-muted text-xs flex-none"
          title="上一个匹配"
        >◀</button>
        <button
          @click="emit('next-match')"
          class="px-1.5 py-0.5 rounded bg-panel-soft hover:bg-border text-muted text-xs flex-none"
          title="下一个匹配"
        >▶</button>
      </template>

      <div class="h-4 w-px bg-border flex-none"></div>

      <!-- 级别过滤 -->
      <select
        :value="filterLevel"
        @change="emit('update:filterLevel', $event.target.value)"
        class="bg-panel-soft border border-border-base rounded px-2 py-1 text-xs text-text-primary outline-none flex-none"
      >
        <option value="all">所有级别 ({{ entries.length.toLocaleString() }})</option>
        <option v-for="(label, key) in levelLabels" :key="key" :value="key">
          {{ label }} ({{ key }})
        </option>
      </select>

      <!-- 自动滚动 -->
      <button
        @click="emit('toggle-auto-scroll')"
        class="px-2 py-1 rounded text-xs flex-none"
        :class="autoScroll ? 'bg-accent-subtle text-accent' : 'bg-panel-soft hover:bg-border text-muted'"
        :title="autoScroll ? '自动滚动已开启' : '自动滚动已关闭'"
      >{{ autoScroll ? '↓ 自动' : '↓ 手动' }}</button>

      <!-- 刷新 -->
      <button
        @click="emit('refresh')"
        class="px-2 py-1 rounded bg-panel-soft hover:bg-border text-muted text-xs flex-none"
        title="重新拉取日志"
      >🔄</button>

      <!-- 暂停提示 -->
      <span v-if="paused" class="text-2xs text-warning flex-none">已暂停</span>

      <!-- 行数 -->
      <span class="text-2xs text-text-tertiary flex-none ml-auto">
        {{ entries.length.toLocaleString() }} 行
      </span>
    </div>

    <!-- ====== 状态视图 ====== -->
    <div v-if="loading" class="flex-1 flex items-center justify-center text-text-tertiary text-sm">
      ⏳ 正在获取 logcat 日志...
    </div>

    <div v-else-if="error" class="flex-1 flex items-center justify-center text-danger text-sm">
      ❌ {{ error }}
    </div>

    <div v-else-if="!totalCount" class="flex-1 flex items-center justify-center text-text-tertiary text-sm">
      无匹配日志
    </div>

    <!-- ====== 虚拟滚动日志列表 ====== -->
    <RecycleScroller
      v-else
      ref="scrollerRef"
      class="log-scroller flex-1"
      :items="displayEntries"
      :item-size="24"
      key-field="id"
      :buffer="600"
      v-slot="{ item: entry }"
      @scroll="onScroll"
    >
      <div
        class="log-row flex items-center gap-1 px-3 border-b border-border-base border-opacity-20 hover:bg-white/5"
        :class="{
          'current-match': isCurrentMatch(entry.id),
          'log-row-error': entry.level === 'E' || entry.level === 'F',
          'log-row-warning': entry.level === 'W'
        }"
      >
        <!-- 未解析行 -->
        <template v-if="!entry.parsed">
          <span class="text-text-tertiary flex-1 truncate">{{ entry.raw }}</span>
        </template>

        <!-- 已解析行：四列布局 -->
        <template v-else>
          <span class="flex-none w-[130px] text-text-tertiary truncate">{{ entry.timestamp }}</span>
          <span
            class="level-badge flex-none w-7 text-center rounded-sm font-bold text-[10px] leading-[18px]"
            :class="levelClass(entry.level)"
          >{{ entry.level }}</span>
          <span class="flex-none max-w-[120px] text-text-secondary truncate" :title="entry.tag">{{ entry.tag }}</span>
          <span class="flex-1 truncate text-text-primary pl-1" v-html="renderMessage(entry)"></span>
        </template>
      </div>
    </RecycleScroller>
  </div>
</template>

<style scoped>
/* RecycleScroller 容器 */
.log-scroller {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}

/* 行高与 RecycleScroller item-size=24 保持一致 */
.log-row {
  height: 24px;
}

/* 级别徽章 */
.level-v { color: var(--muted); background: transparent; }
.level-d { color: var(--info, #58a6ff); background: transparent; }
.level-i { color: var(--success); background: transparent; }
.level-w { color: var(--warning); background: var(--warning-bg); }
.level-e { color: var(--danger); background: var(--danger-bg); }
.level-f { color: #fff; background: var(--danger); }

/* 错误/警告整行底色 */
.log-row-error { background: var(--danger-bg, rgba(248,81,73,0.08)); }
.log-row-warning { background: var(--warning-bg, rgba(210,153,34,0.06)); }

/* 搜索高亮 */
:deep(mark.hl) {
  background-color: var(--accent-subtle, rgba(88,166,255,0.2));
  color: var(--accent-strong, #79c0ff);
  border-radius: 2px;
  padding: 0 1px;
}

/* 当前匹配行 */
.log-row.current-match {
  background: rgba(88, 166, 255, 0.1) !important;
  outline: 1px solid var(--accent-subtle, rgba(88,166,255,0.25));
}
</style>
