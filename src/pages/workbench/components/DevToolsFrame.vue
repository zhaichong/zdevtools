<script setup>
defineProps({ src: { type: String, required: true } });
</script>

<template>
  <div class="w-full h-full bg-zinc-50 flex flex-col">
    <div class="px-3 py-2 bg-zinc-100 border-b border-zinc-200 flex items-center gap-2 flex-shrink-0">
      <span class="w-2 h-2 rounded-full bg-success"></span>
      <span class="text-xs text-zinc-500">Chrome DevTools — deep inspection</span>
    </div>
    <iframe :src="src" class="flex-1 w-full border-0" />
  </div>
</template>
