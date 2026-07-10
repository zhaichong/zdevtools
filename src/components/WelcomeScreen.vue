<template>
    <div class="w-full h-full flex items-start justify-center bg-zinc-50">
        <div class="mt-24 w-full max-w-xl px-6 text-center">
            <div class="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white">
                <span class="h-2.5 w-2.5 rounded-full" :class="dotClass"></span>
            </div>
            <h1 class="text-xl font-semibold text-zinc-900">{{ title }}</h1>
            <p class="mt-2 text-sm text-zinc-500">{{ message }}</p>

            <div v-if="diagnostics.length" class="mt-5 grid gap-2 text-left">
                <p
                    v-for="item in diagnostics"
                    :key="item.message"
                    class="rounded border px-3 py-2 text-xs"
                    :class="item.isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-zinc-200 bg-white text-zinc-500'"
                >
                    {{ item.message }}
                </p>
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
    if (props.status.type === 'busy') return '正在扫描设备';
    if (!props.devicesTotal) return '未发现设备';
    if (!props.targetsTotal) return '未发现 WebView';
    return '发现多个目标';
});

const message = computed(() => {
    if (props.status.type === 'busy') return '正在自动检测已连接的 Android 和 HarmonyOS 设备。';
    if (!props.devicesTotal) return '请确认 USB 已连接，设备已开启调试，并允许电脑调试。';
    if (!props.targetsTotal) return '请确认目标应用已开启 WebView 调试。';
    return '请从上方横条选择要诊断的 WebView。';
});

const dotClass = computed(() => {
    if (props.status.type === 'error') return 'bg-danger';
    if (props.status.type === 'busy') return 'bg-warning';
    return props.targetsTotal ? 'bg-success' : 'bg-warning';
});
</script>
