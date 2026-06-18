<script setup>
import { ref, computed } from 'vue';
import { redact } from '@/shared/utils/redact.js';

const props = defineProps({ lines: { type: Array, default: () => [] } });
const search = ref('');

const filtered = computed(() => {
  if (!search.value) return props.lines;
  const q = search.value.toLowerCase();
  return props.lines.filter(l => l.toLowerCase().includes(q));
});
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden bg-bg-base">
    <div class="flex items-center gap-3 px-3 py-2 bg-bg-layer border-b border-border-base flex-shrink-0">
      <span class="text-xs font-bold text-text-secondary">📜 Android Logcat</span>
      <span class="text-2xs text-text-tertiary">{{ lines.length }} lines</span>
      <div class="flex-1"></div>
      <input v-model="search" class="w-48 px-2.5 py-1 rounded-md border border-border-base bg-bg-base text-xs text-text-primary placeholder-text-disabled outline-none focus:border-accent" placeholder="Filter...">
    </div>
    <pre v-if="filtered.length"
         class="flex-1 overflow-auto m-0 p-3 text-xs font-mono text-text-secondary whitespace-pre-wrap break-all bg-bg-base">{{ redact(filtered.join('\n')) }}</pre>
    <div v-else class="flex-1 flex items-center justify-center text-text-tertiary text-sm">无匹配日志</div>
  </div>
</template>
