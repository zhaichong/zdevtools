<script setup>
import { computed } from 'vue';
import { shortUrl } from '@/shared/utils/format.js';

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  snapshot: { type: Object, default: null },
  profile: { type: Object, default: () => ({}) },
  connected: { type: Boolean, default: false }
});

const androidVersion = computed(() => {
  if (!props.snapshot?.userAgent) return '-';
  const match = props.snapshot.userAgent.match(/Android\s+([^\s;]+)/i);
  return match ? `Android ${match[1]}` : '-';
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
  `系统：${androidVersion.value}`,
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
  <div class="device-page">
    <header class="device-header">
      <div>
        <h2>设备与运行环境</h2>
        <p>只展示排查 WebView 必须看的关键状态。</p>
      </div>
      <span class="device-status" :class="{ online: connected }">
        {{ connected ? '已连接' : '未连接' }}
      </span>
    </header>

    <section class="device-summary">
      <div class="summary-cell">
        <span>设备</span>
        <strong>{{ deviceName }}</strong>
      </div>
      <div class="summary-cell">
        <span>系统</span>
        <strong>{{ androidVersion }}</strong>
      </div>
      <div class="summary-cell">
        <span>视口</span>
        <strong>{{ viewport }}</strong>
      </div>
      <div class="summary-cell">
        <span>像素比</span>
        <strong>{{ dpr }}</strong>
      </div>
    </section>

    <section class="device-grid">
      <article class="device-panel">
        <div class="panel-title">
          <h3>WebView Target</h3>
          <span>{{ profile.label || profile.id || '未知项目' }}</span>
        </div>
        <dl class="kv-list">
          <div><dt>Title</dt><dd>{{ config.title || '-' }}</dd></div>
          <div><dt>URL</dt><dd class="mono" :title="targetUrl">{{ shortUrl(targetUrl) }}</dd></div>
          <div><dt>项目</dt><dd>{{ profile.id || '-' }}</dd></div>
          <div><dt>页面状态</dt><dd>{{ snapshot?.readyState || '-' }}</dd></div>
          <div><dt>Vue Root</dt><dd>{{ snapshot?.hasVueRoot ? 'Found' : 'Not found' }}</dd></div>
          <div><dt>DOM 节点</dt><dd>{{ snapshot?.domNodes ?? '-' }}</dd></div>
        </dl>
      </article>

      <article class="device-panel">
        <div class="panel-title">
          <h3>Bridge & Globals</h3>
          <span>{{ healthyGlobals.length }} 可用 / {{ missingGlobals.length }} 缺失</span>
        </div>
        <div class="global-group">
          <span v-for="[key] in healthyGlobals" :key="key" class="global-chip good">{{ key }} yes</span>
          <span v-for="[key] in missingGlobals" :key="key" class="global-chip bad">{{ key }} no</span>
          <div v-if="!healthyGlobals.length && !missingGlobals.length" class="empty-mini">暂无全局变量快照。</div>
        </div>
      </article>
    </section>

    <footer class="device-footer">
      <span :class="['footer-pill', connected ? 'good' : 'bad']">CDP {{ connected ? 'connected' : 'lost' }}</span>
      <span class="footer-pill">SourceMap 按需上传</span>
      <span class="footer-pill">logcat 独立面板</span>
      <button class="btn primary" type="button" @click="copyEnvironment">复制环境信息</button>
    </footer>
  </div>
</template>
