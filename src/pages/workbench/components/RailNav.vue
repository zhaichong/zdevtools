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
    <nav class="flex flex-col gap-2 p-2 w-20 bg-white backdrop-blur-md border-r border-zinc-200 overflow-y-auto" aria-label="Panel navigation">
        <button
            v-for="panel in panels"
            :key="panel.id"
            class="relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-200 border border-transparent outline-none focus-visible:border-accent"
            :class="activePanel === panel.id ? 'bg-accent/10 border-accent/20 text-accent font-medium shadow-sm shadow-accent/5' : 'bg-transparent text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 hover:border-zinc-200'"
            :title="panel.title"
            type="button"
            @click="$emit('select-panel', panel.id)"
        >
            <span class="grid place-items-center w-7 h-7 rounded border font-mono text-xs shadow-sm transition-colors" :class="activePanel === panel.id ? 'border-accent/40 bg-accent/20' : 'border-zinc-300 bg-white text-zinc-700'">{{ panel.icon }}</span>
            <span class="text-[11px] whitespace-nowrap">{{ panel.label }}</span>
            <small v-if="panel.countKey && counts[panel.countKey]" class="absolute top-1 right-1 bg-danger text-white rounded-full px-1.5 text-[9px] font-bold shadow-sm shadow-danger/50">{{ counts[panel.countKey] }}</small>
        </button>
    </nav>
</template>

