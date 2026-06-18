<template>
    <header class="topbar">
        <div class="brand">
            <span class="brand-mark">LI</span>
            <div>
                <h1>Local Inspect</h1>
                <p>Android WebView 前端报错定位台</p>
            </div>
        </div>
        <div class="topbar-actions">
            <button class="btn ghost" @click="$emit('refresh')" type="button">刷新设备</button>
            <button class="btn ghost" :disabled="restarting" @click="handleRestart" type="button">重启 ADB</button>
            <span class="status-badge" :class="status.type">{{ status.text }}</span>
        </div>
    </header>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
    status: { type: Object, default: () => ({ text: '', type: '' }) }
});
const emit = defineEmits(['refresh', 'restart']);

const restarting = ref(false);
async function handleRestart() {
    restarting.value = true;
    await emit('restart');
    restarting.value = false;
}
</script>
