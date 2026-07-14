<template>
    <div class="w-full h-full flex items-start justify-center bg-zinc-50 p-8 overflow-y-auto">
        <div class="mt-16 w-full max-w-2xl text-center flex flex-col items-center">
            <!-- Center Radar Scanning / Pulse Icon -->
            <div class="relative mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm select-none">
                <span class="absolute inline-flex h-6 w-6 rounded-full opacity-75 animate-ping" :class="dotClass"></span>
                <span class="relative h-3.5 w-3.5 rounded-full shadow-inner" :class="dotClass"></span>
            </div>
            
            <h1 class="text-lg font-bold text-zinc-800 tracking-tight">{{ title }}</h1>
            <p class="mt-2 text-xs text-zinc-500 max-w-md">{{ message }}</p>

            <!-- Diagnostics alerts list -->
            <div v-if="diagnostics.length" class="mt-8 w-full grid gap-2.5 text-left">
                <div
                    v-for="item in diagnostics"
                    :key="item.message"
                    class="rounded-lg border px-4 py-3 text-xs flex items-start gap-2.5 shadow-2xs transition-all duration-150"
                    :class="item.isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-zinc-200 bg-white text-zinc-600'"
                >
                    <svg v-if="item.isError" class="shrink-0 text-red-500 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <svg v-else class="shrink-0 text-zinc-400 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <span class="leading-relaxed">{{ item.message }}</span>
                </div>
            </div>

            <!-- Troubleshooting Setup Guide (Visible when no devices or no targets) -->
            <div class="mt-10 w-full text-left">
                <h3 class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 text-center">WebView 调试接入指南</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-white border border-zinc-200 rounded-xl p-4 shadow-2xs hover:border-zinc-300 transition-colors">
                        <div class="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center font-bold text-sm mb-3">1</div>
                        <h4 class="text-xs font-bold text-zinc-800 mb-1">连接数据线</h4>
                        <p class="text-[11px] text-zinc-500 leading-relaxed">使用 USB 数据线将手机连接到电脑，确保选择“传输文件”模式而非“仅充电”。</p>
                    </div>
                    <div class="bg-white border border-zinc-200 rounded-xl p-4 shadow-2xs hover:border-zinc-300 transition-colors">
                        <div class="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center font-bold text-sm mb-3">2</div>
                        <h4 class="text-xs font-bold text-zinc-800 mb-1">开启 USB 调试</h4>
                        <p class="text-[11px] text-zinc-500 leading-relaxed">进入设置 -> 开发者选项，勾选“开启 USB 调试”。鸿蒙设备请启用“HDC 调试”。</p>
                    </div>
                    <div class="bg-white border border-zinc-200 rounded-xl p-4 shadow-2xs hover:border-zinc-300 transition-colors">
                        <div class="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center font-bold text-sm mb-3">3</div>
                        <h4 class="text-xs font-bold text-zinc-800 mb-1">允许电脑授权</h4>
                        <p class="text-[11px] text-zinc-500 leading-relaxed">解锁手机屏幕，在手机弹出的“允许 USB 调试吗？”对话框中，勾选并点击确定。</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    status: {
        type: Object,
        default: () => ({ text: '初始化中', type: 'busy' })
    },
    devicesTotal: {
        type: Number,
        default: 0
    },
    targetsTotal: {
        type: Number,
        default: 0
    },
    diagnostics: {
        type: Array,
        default: () => []
    }
});

const title = computed(() => {
    if (props.status.type === 'busy') return '正在扫描设备与服务';
    if (!props.devicesTotal) return '未检测到任何连接设备';
    if (!props.targetsTotal) return '已连接设备，但未发现 debug 状态 WebView';
    return '已就绪：发现多个可调试目标';
});

const message = computed(() => {
    if (props.status.type === 'busy') return '正在自动检测已连接的 Android (ADB) 和 HarmonyOS (HDC) 设备。';
    if (!props.devicesTotal) return '请确认手机已插入 USB 接口并启动开发者模式。您可以查看下方的引导说明进行排查。';
    if (!props.targetsTotal) return '请确认手机上的目标应用（App）已处于前端运行，并且在代码中开启了 WebView 调试支持。';
    return '请从顶部控制栏的胶囊列表中选择要进入诊断的目标 WebView。';
});

const dotClass = computed(() => {
    if (props.status.type === 'error') return 'bg-red-500';
    if (props.status.type === 'busy') return 'bg-amber-500';
    return props.targetsTotal ? 'bg-emerald-500' : 'bg-amber-500';
});
</script>
