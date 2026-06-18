<script setup>
defineProps({ src: { type: String, required: true } });
</script>

<template>
  <div class="w-full h-full bg-bg-base flex flex-col">
    <div class="px-3 py-2 bg-bg-layer border-b border-border-base flex items-center gap-2 flex-shrink-0">
      <span class="status-dot online"></span>
      <span class="text-xs text-text-secondary">Chrome DevTools — deep inspection</span>
    </div>
    <iframe :src="src" class="flex-1 w-full border-0" />
  </div>
</template>
