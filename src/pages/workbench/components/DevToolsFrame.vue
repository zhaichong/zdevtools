<script setup>
defineProps({ src: { type: String, required: true } });
</script>

<template>
  <div class="w-full h-full bg-white flex flex-col select-none">
    <div class="px-3 py-2 bg-zinc-50 border-b border-zinc-200 flex items-center gap-2 flex-shrink-0">
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
      <span class="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Chrome DevTools 内嵌调试</span>
    </div>
    <iframe :src="src" class="flex-1 w-full border-0" />
  </div>
</template>
