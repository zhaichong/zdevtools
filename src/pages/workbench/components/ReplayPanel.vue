<script setup>
defineProps({
    breadcrumbs: { type: Array, default: () => [] }
});
defineEmits(['open-replay']);
</script>

<template>
    <div class="flex flex-col h-full bg-white text-zinc-800 p-4 overflow-hidden gap-4">
        <!-- Header -->
        <header class="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-200 pb-3 shrink-0 select-none">
            <div>
                <h2 class="text-sm font-bold text-zinc-800 flex items-center gap-2">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-violet-600"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    操作回放 (rrweb)
                </h2>
                <p class="text-xs text-zinc-400 mt-1">查看错误前后的真实操作画面，完整回放由 rrweb 提供。</p>
            </div>
            <button class="mt-3 md:mt-0 px-4 py-2 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors shadow-sm outline-none flex items-center gap-2 cursor-pointer" type="button" @click="$emit('open-replay')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                打开播放器
            </button>
        </header>

        <!-- Content Area -->
        <section class="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
            <!-- Left: Call to action -->
            <div class="lg:w-1/3 flex flex-col justify-center items-center p-8 rounded-xl border border-zinc-200 bg-white shadow-2xs hover:border-violet-300 transition-colors relative overflow-hidden group cursor-pointer" @click="$emit('open-replay')">
                <!-- Background decorative element -->
                <div class="absolute inset-0 bg-gradient-to-tr from-violet-500/5 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div class="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300 shadow-2xs">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-violet-600"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                </div>
                <h3 class="text-sm font-bold text-zinc-800 mb-2">启动录像播放器</h3>
                <p class="text-xs text-zinc-500 leading-relaxed max-w-xs">在新窗口打开 rrweb 播放器，查看完整录制画面、DOM 变动、操作轨迹和错误前的界面状态。</p>
            </div>
            
            <!-- Right: Breadcrumbs summary -->
            <div class="lg:w-2/3 flex flex-col rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden">
                <div class="p-4 border-b border-zinc-200 bg-zinc-50/50">
                    <h3 class="text-xs font-bold text-zinc-800">错误前关键操作</h3>
                    <p class="text-xs text-zinc-400 mt-1">最近的 16 次行为轨迹</p>
                </div>
                <div class="flex-1 overflow-auto p-4 custom-scrollbar">
                    <div v-if="!breadcrumbs.length" class="h-full flex items-center justify-center text-xs text-zinc-400 border border-dashed border-zinc-200 rounded-lg bg-zinc-50/50">
                        暂无操作面包屑
                    </div>
                    <div v-else class="flex flex-col gap-2">
                        <div v-for="(item, index) in breadcrumbs.slice(-16).reverse()" :key="index" 
                             class="flex items-center gap-3 p-3 rounded-lg border border-zinc-150 bg-zinc-50/50 hover:bg-zinc-50 transition-colors">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border border-zinc-200 bg-white text-zinc-400 shrink-0 w-20 text-center">
                                {{ item.type || 'event' }}
                            </span>
                            <strong class="text-xs font-semibold text-zinc-700 truncate">{{ item.message || item.title || '-' }}</strong>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: #d4d4d8;
    border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #a1a1aa;
}
</style>
