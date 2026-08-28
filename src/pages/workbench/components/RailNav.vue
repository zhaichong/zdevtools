<script setup>
defineProps({
    activePanel: { type: String, default: 'devtools' },
    counts: { type: Object, default: () => ({}) }
});
defineEmits(['select-panel']);

const panels = [
    { id: 'devtools', label: 'DevTools', icon: 'DT', title: 'Chrome DevTools 深度检查' },
    { id: 'logs', label: 'logcat', icon: 'Lg', title: 'Android 与 WebView 相关日志', countKey: 'logcat' }
];
</script>

<template>
    <nav class="flex flex-col gap-1 py-3 px-2 w-20 bg-zinc-50 border-r border-zinc-200 overflow-y-auto select-none" aria-label="Panel navigation">
        <button
            v-for="panel in panels"
            :key="panel.id"
            class="relative group flex flex-col items-center gap-1 py-2 px-1 rounded-lg transition-all duration-150 border border-transparent outline-none cursor-pointer"
            :class="activePanel === panel.id ? 'text-violet-600 font-medium' : 'text-zinc-500 hover:text-zinc-900'"
            :title="panel.title"
            type="button"
            @click="$emit('select-panel', panel.id)"
        >
            <span v-if="activePanel === panel.id" class="absolute left-0 top-3 bottom-3 w-[3px] bg-violet-600 rounded-r-md"></span>

            <span class="grid place-items-center w-8 h-8 rounded-lg border transition-all duration-150" 
                  :class="activePanel === panel.id ? 'border-violet-200 bg-violet-50 text-violet-600 shadow-sm' : 'border-zinc-200 bg-white text-zinc-600 group-hover:border-zinc-300 group-hover:bg-zinc-50'">
                <svg v-if="panel.id === 'devtools'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                <svg v-else-if="panel.id === 'logs'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            </span>
            
            <span class="text-[10px] whitespace-nowrap tracking-wide mt-1" :class="activePanel === panel.id ? 'font-bold' : 'font-normal'">{{ panel.label }}</span>
            <small v-if="panel.countKey && counts[panel.countKey]" class="absolute top-1 right-1 bg-red-500 text-white rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center text-[9px] font-black shadow-sm">{{ counts[panel.countKey] }}</small>
        </button>
    </nav>
</template>
