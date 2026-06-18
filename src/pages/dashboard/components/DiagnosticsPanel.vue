<template>
    <section v-if="diagnostics.length" class="notice-panel">
        <h2>系统诊断</h2>
        <ul>
            <li v-for="(d, i) in diagnostics" :key="i" :class="{ error: d.isError }">{{ d.message }}</li>
        </ul>
    </section>
</template>

<script setup>
defineProps({
    diagnostics: { type: Array, default: () => [] }
});
</script>
