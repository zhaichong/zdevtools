<script setup>
import { computed } from 'vue';
import { shortUrl } from '@/shared/utils/format.js';

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  snapshot: { type: Object, default: null },
  profile: { type: Object, default: () => ({}) },
  connected: { type: Boolean, default: false }
});

const osVersion = computed(() => {
  if (!props.snapshot?.userAgent) return '-';
  const ua = props.snapshot.userAgent;
  if (/HarmonyOS/i.test(ua)) return 'HarmonyOS';
  let match = ua.match(/(Android\s+[^\s;]+)/i);
  if (match) return match[1];
  match = ua.match(/(iPhone|iPad|iPod).*?OS\s+([\d_]+)/i);
  if (match) return `${match[1]} iOS ${match[2].replace(/_/g, '.')}`;
  match = ua.match(/(Windows\s+NT\s+[\d.]+)/i);
  if (match) return match[1];
  match = ua.match(/(Mac\s+OS\s+X\s+[\d_]+)/i);
  if (match) return match[1].replace(/_/g, '.');
  return 'Unknown OS';
});

const viewport = computed(() => {
  if (!props.snapshot) return '-';
  return `${props.snapshot.screenWidth || '-'} x ${props.snapshot.screenHeight || '-'}`;
});

const dpr = computed(() => props.snapshot?.devicePixelRatio ? `DPR ${props.snapshot.devicePixelRatio}` : '-');
const deviceName = computed(() => props.config.model || props.config.deviceId || '-');
const targetUrl = computed(() => props.snapshot?.href || props.config.url || '-');

const healthyGlobals = computed(() => {
  const globals = props.snapshot?.globals || {};
  return Object.entries(globals).filter(([, value]) => Boolean(value));
});

const missingGlobals = computed(() => {
  const globals = props.snapshot?.globals || {};
  return Object.entries(globals).filter(([, value]) => !value);
});

const envText = computed(() => [
  `设备：${deviceName.value}`,
  `系统：${osVersion.value}`,
  `视口：${viewport.value} / ${dpr.value}`,
  `项目：${props.profile?.label || props.profile?.id || '-'}`,
  `页面：${targetUrl.value}`,
  `CDP：${props.connected ? '已连接' : '未连接'}`,
  `readyState：${props.snapshot?.readyState || '-'}`,
  `DOM 节点：${props.snapshot?.domNodes ?? '-'}`
].join('\n'));

async function copyEnvironment() {
  await navigator.clipboard.writeText(envText.value);
}
</script>

<template>
  <div class="flex flex-col h-full bg-zinc-50 text-zinc-800 p-4 overflow-auto custom-scrollbar gap-6">
    <!-- Header -->
    <header class="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-200 pb-3 shrink-0">
      <div>
        <h2 class="text-lg font-semibold text-zinc-900 flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-accent"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
          设备与运行环境
        </h2>
        <p class="text-xs text-zinc-500 mt-1">只展示排查 WebView 必须看的关键状态。</p>
      </div>
      <div class="flex items-center gap-3 mt-3 md:mt-0">
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-sm text-xs font-bold tracking-wide uppercase transition-colors"
             :class="connected ? 'border-success/20 bg-success/10 text-success' : 'border-danger/20 bg-danger/10 text-danger'">
          <div class="w-1.5 h-1.5 rounded-full animate-pulse" :class="connected ? 'bg-success' : 'bg-danger'"></div>
          {{ connected ? 'CDP 已连接' : 'CDP 未连接' }}
        </div>
      </div>
    </header>

    <!-- Top Summary Grid -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
      <div class="flex flex-col gap-1 p-4 rounded-xl border border-zinc-200 bg-white shadow-sm">
        <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">设备型号</span>
        <strong class="text-lg font-bold text-zinc-900 truncate" :title="deviceName">{{ deviceName }}</strong>
      </div>
      <div class="flex flex-col gap-1 p-4 rounded-xl border border-zinc-200 bg-white shadow-sm">
        <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">系统版本</span>
        <strong class="text-lg font-bold text-zinc-900 truncate" :title="props.snapshot?.userAgent">{{ osVersion }}</strong>
      </div>
      <div class="flex flex-col gap-1 p-4 rounded-xl border border-zinc-200 bg-white shadow-sm">
        <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">屏幕视口</span>
        <strong class="text-lg font-bold text-zinc-900 truncate">{{ viewport }}</strong>
      </div>
      <div class="flex flex-col gap-1 p-4 rounded-xl border border-zinc-200 bg-white shadow-sm">
        <span class="text-xs font-semibold text-zinc-500 uppercase tracking-wider">像素比</span>
        <strong class="text-lg font-bold text-zinc-900 truncate">{{ dpr }}</strong>
      </div>
    </section>

    <!-- Main Detail Grid -->
    <section class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <!-- Target Info -->
      <article class="flex flex-col rounded-xl border border-zinc-200 bg-white backdrop-blur shadow-sm overflow-hidden">
        <div class="flex items-center justify-between p-4 border-b border-zinc-200 bg-zinc-50/50">
          <h3 class="text-sm font-semibold text-zinc-900">WebView Target</h3>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold border border-zinc-300 bg-zinc-100 text-zinc-700">
            {{ profile.label || profile.id || '未知项目' }}
          </span>
        </div>
        <div class="p-4">
          <dl class="flex flex-col gap-4">
            <div class="flex justify-between items-start gap-4 pb-4 border-b border-zinc-100 last:border-0 last:pb-0">
              <dt class="text-xs text-zinc-500 mt-0.5 shrink-0 w-24">Title</dt>
              <dd class="text-sm text-zinc-800 font-medium break-words text-right">{{ config.title || '-' }}</dd>
            </div>
            <div class="flex justify-between items-start gap-4 pb-4 border-b border-zinc-100 last:border-0 last:pb-0">
              <dt class="text-xs text-zinc-500 mt-0.5 shrink-0 w-24">URL</dt>
              <dd class="text-xs text-accent font-mono break-all text-right cursor-help" :title="targetUrl">{{ shortUrl(targetUrl) }}</dd>
            </div>
            <div class="flex justify-between items-start gap-4 pb-4 border-b border-zinc-100 last:border-0 last:pb-0">
              <dt class="text-xs text-zinc-500 mt-0.5 shrink-0 w-24">项目ID</dt>
              <dd class="text-sm text-zinc-800 font-medium text-right">{{ profile.id || '-' }}</dd>
            </div>
            <div class="flex justify-between items-start gap-4 pb-4 border-b border-zinc-100 last:border-0 last:pb-0">
              <dt class="text-xs text-zinc-500 mt-0.5 shrink-0 w-24">页面状态</dt>
              <dd class="text-sm font-medium text-right" :class="snapshot?.readyState === 'complete' ? 'text-success' : 'text-warning'">{{ snapshot?.readyState || '-' }}</dd>
            </div>
            <div class="flex justify-between items-start gap-4 pb-4 border-b border-zinc-100 last:border-0 last:pb-0">
              <dt class="text-xs text-zinc-500 mt-0.5 shrink-0 w-24">Vue Root</dt>
              <dd class="text-sm font-medium text-right" :class="snapshot?.hasVueRoot ? 'text-success' : 'text-danger'">{{ snapshot?.hasVueRoot ? 'Found' : 'Not found' }}</dd>
            </div>
            <div class="flex justify-between items-start gap-4 pb-4 border-b border-zinc-100 last:border-0 last:pb-0">
              <dt class="text-xs text-zinc-500 mt-0.5 shrink-0 w-24">DOM 节点数</dt>
              <dd class="text-sm text-zinc-800 font-medium text-right font-mono">{{ snapshot?.domNodes ?? '-' }}</dd>
            </div>
          </dl>
        </div>
      </article>

      <!-- Globals Info -->
      <article class="flex flex-col rounded-xl border border-zinc-200 bg-white backdrop-blur shadow-sm overflow-hidden">
        <div class="flex items-center justify-between p-4 border-b border-zinc-200 bg-zinc-50/50">
          <h3 class="text-sm font-semibold text-zinc-900">Bridge & Globals</h3>
          <span class="text-xs text-zinc-500">
            <span class="text-success font-bold">{{ healthyGlobals.length }}</span> 可用 / 
            <span class="text-danger font-bold">{{ missingGlobals.length }}</span> 缺失
          </span>
        </div>
        <div class="p-4 flex-1">
          <div v-if="!healthyGlobals.length && !missingGlobals.length" class="h-full flex items-center justify-center text-sm text-zinc-500 border border-dashed border-zinc-300 rounded-lg bg-zinc-50/50">
            暂无全局变量快照
          </div>
          <div v-else class="flex flex-wrap gap-2">
            <div v-for="[key] in healthyGlobals" :key="key" class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-success/10 border border-success/20 text-success text-xs font-mono font-medium">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
              {{ key }}
            </div>
            <div v-for="[key] in missingGlobals" :key="key" class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-danger/10 border border-danger/20 text-danger text-xs font-mono font-medium opacity-80">
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              {{ key }}
            </div>
          </div>
        </div>
      </article>
    </section>

    <!-- Footer -->
    <footer class="mt-auto flex flex-wrap items-center gap-3 pt-4 border-t border-zinc-200 shrink-0">
      <button class="px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20 outline-none" type="button" @click="copyEnvironment">
        复制环境信息
      </button>
      <span class="px-2.5 py-1 rounded-md bg-zinc-100 border border-zinc-200 text-xs text-zinc-500">SourceMap 按需上传</span>
      <span class="px-2.5 py-1 rounded-md bg-zinc-100 border border-zinc-200 text-xs text-zinc-500">logcat 独立面板</span>
    </footer>
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
