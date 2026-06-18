<script setup>
import { ref, nextTick } from 'vue';
import { formatTime } from '@/shared/utils/format.js';
import { redact } from '@/shared/utils/redact.js';

const props = defineProps({
    entries: { type: Array, default: () => [] },
    stats: { type: Object, default: () => ({ total: 0, errors: 0, warnings: 0 }) },
    filterLevel: { type: String, default: 'all' },
    searchText: { type: String, default: '' },
    paused: { type: Boolean, default: false },
    levelLabels: { type: Object, default: () => ({}) },
    onExecute: { type: Function, default: null }
});
const emit = defineEmits(['update:filterLevel', 'update:searchText', 'toggle-pause', 'clear']);

const expandedIds = ref(new Set());
const replInput = ref('');
const replHistory = ref([]);
const historyIndex = ref(-1);

function toggleExpand(id) {
    if (expandedIds.value.has(id)) expandedIds.value.delete(id);
    else expandedIds.value.add(id);
}

function handleExecute() {
    if (!replInput.value.trim() || !props.onExecute) return;
    props.onExecute(replInput.value);
    replHistory.value.push(replInput.value);
    historyIndex.value = replHistory.value.length;
    replInput.value = '';
}
</script>

<template>
  <div class="flex flex-col h-full bg-bg-base overflow-hidden text-sm">
    <!-- Toolbar -->
    <div class="flex items-center gap-3 p-2 border-b border-border bg-panel flex-none">
      <button @click="emit('clear')" class="px-2 py-1 rounded bg-panel-soft hover:bg-border text-muted">🚫 清空</button>
      <div class="h-4 w-px bg-border"></div>
      <input 
        type="text" 
        :value="searchText" 
        @input="e => emit('update:searchText', e.target.value)" 
        placeholder="过滤输出..." 
        class="bg-panel-soft border border-border rounded px-2 py-1 text-text flex-1 outline-none focus:border-accent"
      />
      <select 
        :value="filterLevel" 
        @change="e => emit('update:filterLevel', e.target.value)" 
        class="bg-panel-soft border border-border rounded px-2 py-1 text-text outline-none"
      >
        <option value="all">所有级别 ({{ stats.total }})</option>
        <option value="error">Errors ({{ stats.errors }})</option>
        <option value="warning">Warnings ({{ stats.warnings }})</option>
        <option value="log">Logs</option>
      </select>
    </div>

    <!-- Messages -->
    <div class="flex-1 overflow-auto font-mono text-[13px]">
      <div v-if="entries.length === 0" class="p-4 text-center text-muted">
        控制台暂时没有输出
      </div>
      <div 
        v-for="entry in entries" 
        :key="entry.id" 
        class="flex gap-2 p-2 border-b border-border border-opacity-30 group"
        :class="{
          'bg-danger-bg text-danger': entry.level === 'error',
          'bg-warning-bg text-warning': entry.level === 'warning' || entry.level === 'warn',
          'text-muted-strong': entry.level === 'log' || entry.level === 'info',
        }"
      >
        <!-- Icon/Count -->
        <div class="flex-none w-6 text-right">
          <span v-if="entry.count > 1" class="inline-block px-1 rounded bg-accent text-bg text-xs">{{ entry.count }}</span>
          <span v-else-if="entry.level === 'error'">❌</span>
          <span v-else-if="entry.level === 'warning'">⚠️</span>
          <span v-else-if="entry.isInput">❯</span>
          <span v-else-if="entry.isRepl">❮</span>
        </div>
        
        <!-- Content -->
        <div class="flex-1 break-all">
          <div @click="entry.stack || entry.preview ? toggleExpand(entry.id) : null" :class="{'cursor-pointer hover:underline': entry.stack || entry.preview}">
            <template v-if="Array.isArray(entry.text)">
              <span v-for="(part, i) in entry.text" :key="i" class="mr-2">{{ part }}</span>
            </template>
            <template v-else>
              {{ entry.text }}
            </template>
          </div>
          
          <!-- Stack / Expandable Detail -->
          <div v-if="expandedIds.has(entry.id) && (entry.stack?.length || entry.preview)" class="mt-2 pl-4 border-l-2 border-border text-xs text-muted">
            <div v-if="entry.preview" class="whitespace-pre-wrap">{{ JSON.stringify(entry.preview, null, 2) }}</div>
            <div v-for="(frame, i) in entry.stack" :key="i" class="truncate hover:text-text">
              at {{ frame.functionName || '(anonymous)' }} ({{ frame.url }}:{{ frame.lineNumber }}:{{ frame.columnNumber }})
            </div>
          </div>
        </div>

        <!-- Source Link -->
        <div class="flex-none text-xs text-muted w-24 text-right truncate" :title="entry.url">
          <span v-if="entry.url">{{ entry.url.split('/').pop() }}:{{ entry.line }}</span>
          <span v-else-if="entry.time">{{ formatTime(entry.time) }}</span>
        </div>
      </div>
    </div>

    <!-- REPL Input -->
    <div class="flex-none border-t border-border flex items-center bg-panel">
      <span class="text-accent pl-3 pr-2 font-bold font-mono">❯</span>
      <input 
        v-model="replInput"
        @keydown.enter="handleExecute"
        type="text" 
        placeholder="运行 JavaScript..." 
        class="w-full bg-transparent border-none outline-none py-2 font-mono text-[13px] text-text placeholder-muted"
      />
    </div>
  </div>
</template>

<style scoped>
/* Scoped styles if needed */
</style>
