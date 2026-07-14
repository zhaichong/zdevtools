<script setup>
defineProps({
    activePanel: { type: String, default: 'diagnosis' },
    counts: { type: Object, default: () => ({}) }
});
defineEmits(['select-panel']);

const panels = [
    { id: 'diagnosis', label: '诊断', icon: 'Dx', title: '根因聚合与修复线索', countKey: 'causes' },
    { id: 'timeline', label: '时间轴', icon: 'Tl', title: '错误前后的行为、请求、日志证据链', countKey: 'timeline' },
    { id: 'replay', label: '回放', icon: 'Rv', title: '用户操作场景回放' },
    { id: 'device', label: '设备', icon: 'Dv', title: '设备、WebView、Bridge 与运行环境' },
    { id: 'logs', label: 'logcat', icon: 'Lg', title: 'Android 与 WebView 相关日志', countKey: 'logcat' },
    { id: 'report', label: '报告', icon: 'Rp', title: '复制和导出排查证据' },
    { id: 'devtools', label: 'DevTools', icon: 'DT', title: 'Chrome DevTools 深度检查' }
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
            <!-- Active Indicator Line -->
            <span v-if="activePanel === panel.id" class="absolute left-0 top-3 bottom-3 w-[3px] bg-violet-600 rounded-r-md"></span>

            <span class="grid place-items-center w-8 h-8 rounded-lg border transition-all duration-150" 
                  :class="activePanel === panel.id ? 'border-violet-200 bg-violet-50 text-violet-600 shadow-sm' : 'border-zinc-200 bg-white text-zinc-600 group-hover:border-zinc-300 group-hover:bg-zinc-50'">
                <svg v-if="panel.id === 'diagnosis'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16 10-4 4-2-2"/></svg>
                <svg v-else-if="panel.id === 'timeline'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <svg v-else-if="panel.id === 'replay'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <svg v-else-if="panel.id === 'device'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                <svg v-else-if="panel.id === 'logs'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                <svg v-else-if="panel.id === 'report'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <svg v-else-if="panel.id === 'devtools'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </span>
            
            <span class="text-[10px] whitespace-nowrap tracking-wide mt-1" :class="activePanel === panel.id ? 'font-bold' : 'font-normal'">{{ panel.label }}</span>
            <small v-if="panel.countKey && counts[panel.countKey]" class="absolute top-1 right-1 bg-red-500 text-white rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center text-[9px] font-black shadow-sm">{{ counts[panel.countKey] }}</small>
        </button>
    </nav>
</template>

