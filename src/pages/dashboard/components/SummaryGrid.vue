<template>
    <section class="summary-grid">
        <div class="metric">
            <span class="metric-label">设备</span>
            <strong>{{ devices }}</strong>
            <small>ADB 已识别</small>
        </div>
        <div class="metric">
            <span class="metric-label">WebView</span>
            <strong>{{ targets }}</strong>
            <small>可进入工作台</small>
        </div>
        <div class="metric">
            <span class="metric-label">异常提示</span>
            <strong>{{ errors }}</strong>
            <small>设备或进程诊断</small>
        </div>
        <div class="metric">
            <span class="metric-label">最近扫描</span>
            <strong>{{ lastScan }}</strong>
            <small>自动轮询更新</small>
        </div>
    </section>
</template>

<script setup>
defineProps({
    devices: { type: Number, default: 0 },
    targets: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
    lastScan: { type: String, default: '-' }
});
</script>
