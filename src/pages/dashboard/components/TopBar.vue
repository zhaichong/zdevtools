<template>
    <header class="topbar">
        <div class="brand">
            <img class="brand-mark" src="/logo.png" alt="ztools logo" />
            <div class="brand-copy">
                <h1>ztools <span v-if="currentVersion" class="version-tag">v{{ currentVersion }}</span></h1>
            </div>
        </div>

        <div class="topbar-actions">
            <div class="update-area">
                <button v-if="updateStatus === 'checking'" class="btn ghost" disabled type="button">
                    <span class="spinner"></span>检查中
                </button>
                <button v-else-if="updateStatus === 'available'" class="btn primary" type="button" @click="$emit('download-update')">
                    下载更新 <strong v-if="updateInfo">v{{ updateInfo.version }}</strong>
                </button>
                <template v-else-if="updateStatus === 'downloading'">
                    <div class="download-progress-wrap">
                        <span class="download-text">下载中 {{ downloadProgress.percent }}%</span>
                        <div class="progress-bar">
                            <div class="progress-fill" :style="{ width: downloadProgress.percent + '%' }"></div>
                        </div>
                    </div>
                </template>
                <button v-else-if="updateStatus === 'downloaded'" class="btn accent" type="button" @click="$emit('quit-install')">
                    重启安装
                </button>
                <button v-else-if="updateStatus === 'not-available'" class="btn ghost subtle" disabled type="button">
                    已是最新
                </button>
                <button
                    v-else-if="updateStatus === 'error'"
                    class="btn ghost danger"
                    type="button"
                    :title="'更新出错：' + (updateErrorMessage || '未知错误') + '，点击重试'"
                    @click="$emit('check-update')"
                >
                    更新失败
                </button>
                <button v-else class="btn ghost" type="button" @click="$emit('check-update')">
                    检查更新
                </button>
            </div>

            <button class="btn secondary" type="button" @click="$emit('refresh')">刷新设备</button>
            <span class="status-badge" :class="status.type">{{ status.text }}</span>
        </div>
    </header>
</template>

<script setup>
defineProps({
    status: { type: Object, default: () => ({ text: '', type: '' }) },
    updateStatus: { type: String, default: 'idle' },
    downloadProgress: { type: Object, default: () => ({ percent: 0 }) },
    updateInfo: { type: Object, default: null },
    updateErrorMessage: { type: String, default: '' },
    currentVersion: { type: String, default: '' }
});

defineEmits(['refresh', 'restart', 'check-update', 'download-update', 'quit-install']);
</script>

<style scoped>
.brand-copy {
    min-width: 0;
}

.version-tag {
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    padding: 1px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: #fff;
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
    vertical-align: middle;
}

.update-area {
    display: flex;
    align-items: center;
    gap: 8px;
}

.spinner {
    width: 12px;
    height: 12px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.download-progress-wrap {
    display: grid;
    gap: 4px;
    width: 140px;
}

.download-text {
    color: var(--muted-strong);
    font-size: 12px;
    white-space: nowrap;
}

.progress-bar {
    height: 4px;
    overflow: hidden;
    border-radius: 2px;
    background: var(--panel-strong);
}

.progress-fill {
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
    transition: width 0.2s ease;
}

.btn.accent {
    border-color: var(--success);
    background: var(--success);
    color: #fff;
}

.btn.ghost.danger {
    color: var(--danger);
}

.btn.ghost.subtle {
    color: var(--success);
    cursor: default;
}
</style>
