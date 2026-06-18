<script setup>
import { computed } from 'vue';

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  snapshot: { type: Object, default: null },
  profile: { type: Object, default: () => ({}) },
  connected: { type: Boolean, default: false }
});
</script>

<template>
  <div class="flex flex-col h-full overflow-auto bg-bg-base p-4 space-y-4">
    <!-- Connection -->
    <div class="card !rounded-lg p-4 flex items-center gap-3">
      <div class="status-dot" :class="connected ? 'online' : 'offline'"></div>
      <div>
        <h3 class="text-sm font-bold text-text-primary m-0">{{ connected ? 'Connected' : 'Disconnected' }}</h3>
        <p class="text-xs text-text-tertiary m-0 mt-0.5">CDP WebSocket (Chrome DevTools Protocol)</p>
      </div>
    </div>

    <!-- Target -->
    <div class="card !rounded-lg p-4">
      <h4 class="text-xs font-bold text-text-primary m-0 mb-3 uppercase tracking-wider">Target</h4>
      <div class="space-y-2.5 text-sm">
        <div class="flex justify-between"><span class="text-text-tertiary">Title</span><span class="text-text-primary font-medium truncate ml-3">{{ config.title || '-' }}</span></div>
        <div class="flex justify-between"><span class="text-text-tertiary">URL</span><span class="text-text-secondary font-mono text-xs truncate ml-3 max-w-[200px]">{{ config.url || '-' }}</span></div>
        <div class="flex justify-between"><span class="text-text-tertiary">Device</span><span class="text-text-primary">{{ config.model || config.deviceId || '-' }}</span></div>
      </div>
    </div>

    <!-- Profile -->
    <div class="card !rounded-lg p-4">
      <h4 class="text-xs font-bold text-text-primary m-0 mb-3 uppercase tracking-wider">Project</h4>
      <div class="space-y-2.5 text-sm">
        <div class="flex justify-between"><span class="text-text-tertiary">ID</span><span class="text-text-primary font-mono text-xs">{{ profile.id || '-' }}</span></div>
        <div class="flex justify-between"><span class="text-text-tertiary">Label</span><span class="text-text-primary">{{ profile.label || '-' }}</span></div>
      </div>
    </div>

    <!-- Snapshot -->
    <div v-if="snapshot" class="card !rounded-lg p-4">
      <h4 class="text-xs font-bold text-text-primary m-0 mb-3 uppercase tracking-wider">Snapshot</h4>
      <div class="space-y-2.5 text-sm">
        <div class="flex justify-between"><span class="text-text-tertiary">readyState</span><span class="text-text-primary font-mono">{{ snapshot.readyState }}</span></div>
        <div class="flex justify-between"><span class="text-text-tertiary">DOM Nodes</span><span class="text-text-primary font-mono">{{ snapshot.domNodes }}</span></div>
        <div class="flex justify-between"><span class="text-text-tertiary">Vue Root</span><span class="text-text-primary">{{ snapshot.hasVueRoot ? '✓ Found' : '✗ Not found' }}</span></div>
      </div>
      <div v-if="snapshot.globals" class="mt-3 flex flex-wrap gap-1.5">
        <span v-for="(val, key) in snapshot.globals" :key="key"
              class="pill text-2xs" :class="val ? 'bg-success-bg text-success border border-success-border/20' : 'bg-danger-bg text-danger border border-danger-border/20'">
          {{ key }}: {{ val ? 'yes' : 'no' }}
        </span>
      </div>
    </div>
  </div>
</template>
