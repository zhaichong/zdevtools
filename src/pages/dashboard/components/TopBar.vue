<template>
    <header class="topbar">
        <div class="brand">
            <img class="brand-mark" src="/logo.png" alt="ztools logo" style="object-fit: cover; background: none;" />
            <div>
                <h1>ztools</h1>
                <p>
                    <span v-if="currentVersion" class="version-tag">v{{ currentVersion }}</span>
                </p>
            </div>
        </div>
        <div class="topbar-actions">
            <!-- 在线更新区域 -->
            <div class="update-area">
                <!-- 检查中 -->
                <button v-if="updateStatus === 'checking'" class="btn ghost" disabled type="button">
                    <span class="spinner"></span>检查中...
                </button>

                <!-- 有新版本 -->
                <button v-else-if="updateStatus === 'available'"
                    class="btn primary"
                    @click="$emit('download-update')" type="button">
                    下载更新 <strong v-if="updateInfo">v{{ updateInfo.version }}</strong>
                </button>

                <!-- 下载中 + 进度条 -->
                <template v-else-if="updateStatus === 'downloading'">
                    <div class="download-progress-wrap">
                        <span class="download-text">下载中 {{ downloadProgress.percent }}%</span>
                        <div class="progress-bar">
                            <div class="progress-fill" :style="{ width: downloadProgress.percent + '%' }"></div>
                        </div>
                    </div>
                </template>

                <!-- 下载完成 -->
                <button v-else-if="updateStatus === 'downloaded'"
                    class="btn accent"
                    @click="$emit('quit-install')" type="button">
                    重启安装
                </button>

                <!-- 已是最新 -->
                <button v-else-if="updateStatus === 'not-available'" class="btn ghost subtle" disabled type="button">
                    ✓ 已是最新
                </button>

                <!-- 出错 -->
                <button v-else-if="updateStatus === 'error'"
                    class="btn ghost danger"
                    @click="$emit('check-update')" type="button"
                    :title="'更新出错：' + (updateErrorMessage || '未知错误') + ' — 点击重试'">
                    ⚠ 更新失败
                </button>

                <!-- 默认 idle：检查更新 -->
                <button v-else class="btn ghost" @click="$emit('check-update')" type="button">
                    检查更新
                </button>
            </div>

            <button class="btn ghost" @click="$emit('refresh')" type="button">刷新设备</button>
            <button class="btn ghost" :disabled="restarting" @click="handleRestart" type="button">重启 ADB</button>
            <span class="status-badge" :class="status.type">{{ status.text }}</span>
        </div>
    </header>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
    status: { type: Object, default: () => ({ text: '', type: '' }) },
    // 更新相关 props
    updateStatus: { type: String, default: 'idle' },
    downloadProgress: { type: Object, default: () => ({ percent: 0 }) },
    updateInfo: { type: Object, default: null },
    updateErrorMessage: { type: String, default: '' },
    currentVersion: { type: String, default: '' }
});

const emit = defineEmits(['refresh', 'restart', 'check-update', 'download-update', 'quit-install']);

const restarting = ref(false);
async function handleRestart() {
    restarting.value = true;
    emit('restart');
    restarting.value = false;
}
</script>

<style scoped>
.version-tag {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 6px;
    font-size: 11px;
    border-radius: 4px;
    background: var(--panel-strong);
    color: var(--muted);
    vertical-align: middle;
}

.update-area {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 4px;
}

/* Spinner */
.spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin-right: 6px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    vertical-align: middle;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

/* 下载进度 */
.download-progress-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 140px;
}

.download-text {
    font-size: 12px;
    color: var(--accent);
    white-space: nowrap;
}

.progress-bar {
    width: 100%;
    height: 4px;
    background: var(--panel-strong);
    border-radius: 2px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.2s ease;
}

/* 按钮变体 */
.btn.primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
}
.btn.primary:hover {
    background: var(--accent-strong);
    border-color: var(--accent-strong);
}

.btn.accent {
    background: var(--success);
    color: #fff;
    border-color: var(--success);
}
.btn.accent:hover {
    filter: brightness(1.15);
}

.btn.ghost.danger {
    color: var(--danger);
    border-color: var(--danger);
}
.btn.ghost.danger:hover {
    background: var(--danger-bg);
}

.btn.ghost.subtle {
    color: var(--success);
    border-color: transparent;
    cursor: default;
    opacity: 0.7;
}

.btn strong {
    font-weight: 600;
    margin-left: 2px;
}
</style>
