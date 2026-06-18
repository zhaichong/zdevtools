<script setup>
import { ref, computed } from 'vue';
import { redact } from '@/shared/utils/redact.js';

const props = defineProps({
  requests: { type: Array, default: () => [] },
  stats: { type: Object, default: () => ({ total: 0, failed: 0, pending: 0, totalSize: 0 }) },
  filterType: { type: String, default: 'all' },
  searchText: { type: String, default: '' },
  paused: { type: Boolean, default: false },
  onFetchBody: { type: Function, default: null }
});
const emit = defineEmits(['update:filterType', 'update:searchText', 'toggle-pause', 'clear']);

const selectedId = ref('');
const detailTab = ref('headers');

function methodColor(m) {
  const colors = { GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b', DELETE: '#ef4444', PATCH: '#a78bfa' };
  return colors[m] || '#8b949e';
}
function statusColor(s) {
  if (s >= 500) return 'text-danger';
  if (s >= 400) return 'text-warning';
  if (s >= 300) return 'text-info';
  if (s > 0) return 'text-success';
  return 'text-text-tertiary';
}
function sizeFmt(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

async function selectReq(r) {
  selectedId.value = r.requestId;
  detailTab.value = 'headers';
  if (props.onFetchBody) {
    try {
      const body = await props.onFetchBody(r.requestId);
      r._body = body;
    } catch (e) { r._body = { type: 'error', hint: e.message }; }
  }
}

const selected = computed(() => props.requests.find(r => r.requestId === selectedId.value) || null);
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden bg-bg-base">
    <!-- Toolbar -->
    <div class="flex items-center gap-3 px-3 py-2 border-b border-border-base bg-bg-layer flex-shrink-0">
      <div class="flex gap-1">
        <button v-for="t in ['all','xhr','js','css','img','doc']" :key="t"
          class="text-2xs font-semibold px-2 py-1 rounded-md border-none cursor-pointer transition-colors"
          :class="filterType === t ? 'bg-accent-subtle text-accent-hover' : 'bg-transparent text-text-tertiary hover:text-text-secondary'"
          type="button" @click="emit('update:filterType', t)">
          {{ t === 'all' ? `All (${stats.total})` : t.toUpperCase() }}
        </button>
      </div>
      <div class="flex-1"></div>
      <span class="text-2xs text-text-tertiary">{{ sizeFmt(stats.totalSize) }}</span>
      <span v-if="stats.failed" class="text-2xs text-danger font-bold">{{ stats.failed }} failed</span>
      <input class="w-44 px-2.5 py-1 rounded-md border border-border-base bg-bg-base text-xs text-text-primary placeholder-text-disabled outline-none focus:border-accent"
        placeholder="Filter URL..." :value="searchText" @input="emit('update:searchText', $event.target.value)">
      <button class="btn btn-ghost text-xs py-1 px-2" type="button" @click="emit('toggle-pause')">{{ paused ? '▶' : '⏸' }}</button>
      <button class="btn btn-ghost text-xs py-1 px-2" type="button" @click="emit('clear')">Clear</button>
    </div>

    <!-- Split: list + detail -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Request list -->
      <div class="flex-1 overflow-auto">
        <div v-for="r in requests" :key="r.requestId"
          class="grid grid-cols-[48px,72px,80px,1fr,60px] gap-2 items-center px-3 py-1.5 border-b border-border-base/50 hover:bg-bg-raised/50 cursor-pointer transition-colors text-xs"
          :class="{ 'bg-accent-subtle/20': r.requestId === selectedId }"
          @click="selectReq(r)">
          <span class="font-bold font-mono" :style="{ color: methodColor(r.method) }">{{ r.method }}</span>
          <span class="font-mono font-bold" :class="statusColor(r.status)">{{ r.status || '...' }}</span>
          <span class="text-text-tertiary font-mono uppercase text-2xs">{{ r.type }}</span>
          <span class="text-text-secondary font-mono truncate">{{ redact(r.url) }}</span>
          <span class="text-text-tertiary text-right font-mono text-2xs">{{ r.duration ? `${r.duration}ms` : '' }}</span>
        </div>
        <div v-if="!requests.length" class="flex items-center justify-center h-full text-text-tertiary text-sm">
          等待网络请求...
        </div>
      </div>

      <!-- Detail panel -->
      <div v-if="selected" class="w-[380px] border-l border-border-base overflow-auto bg-bg-layer flex-shrink-0">
        <div class="flex gap-0.5 px-2 py-1.5 border-b border-border-base">
          <button v-for="t in ['headers','response']" :key="t"
            class="text-2xs font-semibold px-2.5 py-1 rounded border-none cursor-pointer transition-colors"
            :class="detailTab === t ? 'bg-accent-subtle text-accent-hover' : 'bg-transparent text-text-tertiary hover:text-text-secondary'"
            type="button" @click="detailTab = t">{{ t }}</button>
        </div>
        <template v-if="detailTab === 'headers'">
          <div class="p-3 space-y-2">
            <div class="flex justify-between text-xs">
              <span class="text-text-disabled">URL</span>
              <span class="text-text-secondary font-mono break-all text-right ml-3">{{ redact(selected.url) }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-text-disabled">Status</span>
              <span class="font-mono font-bold" :class="statusColor(selected.status)">{{ selected.status }} {{ selected.statusText }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-text-disabled">Type</span>
              <span class="text-text-secondary font-mono">{{ selected.mimeType || selected.type }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-text-disabled">Size</span>
              <span class="text-text-secondary font-mono">{{ sizeFmt(selected.size) }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-text-disabled">Duration</span>
              <span class="text-text-secondary font-mono">{{ selected.duration ? `${selected.duration}ms` : '-' }}</span>
            </div>
          </div>
        </template>
        <template v-if="detailTab === 'response'">
          <div class="p-3">
            <pre v-if="selected._body?.type === 'json'"
                 class="text-xs font-mono text-text-secondary bg-bg-base rounded-md p-3 border border-border-base max-h-[400px] overflow-auto whitespace-pre-wrap break-all m-0">{{ JSON.stringify(selected._body.body, null, 2) }}</pre>
            <pre v-else-if="selected._body?.type === 'text'"
                 class="text-xs font-mono text-text-secondary bg-bg-base rounded-md p-3 border border-border-base max-h-[400px] overflow-auto whitespace-pre-wrap break-all m-0">{{ selected._body.body }}</pre>
            <div v-else-if="selected._body?.hint" class="text-xs text-text-tertiary p-3">{{ selected._body.hint }}</div>
            <div v-else class="text-xs text-text-tertiary p-3">点击请求加载响应体</div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
