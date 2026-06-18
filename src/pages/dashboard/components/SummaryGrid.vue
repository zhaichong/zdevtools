<template>
    <section class="summary-grid">
        <div class="metric">
            <span class="metric-label">设备</span>
            <strong>{{ devices }}</strong>
        </div>
        <div class="metric">
            <span class="metric-label">WebView</span>
            <strong>{{ targets }}</strong>
        </div>
        <div class="metric">
            <span class="metric-label">已诊断错误</span>
            <strong>{{ errors }}</strong>
        </div>
        <div class="metric">
            <span class="metric-label">最近扫描</span>
            <strong>{{ lastScan }}</strong>
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
