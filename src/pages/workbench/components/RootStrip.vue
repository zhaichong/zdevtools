<script setup>
defineProps({
    causes: { type: Array, default: () => [] },
    selectedId: { type: String, default: '' }
});
defineEmits(['select']);

function severityClass(priority) {
    if (priority === 'P0') return 'danger';
    if (priority === 'P1' || priority === 'P2') return 'warning';
    return 'info';
}
</script>

<template>
    <div class="root-strip">
        <template v-if="causes.length">
            <button
                v-for="cause in causes.slice(0, 5)"
                :key="cause.id"
                class="root-chip"
                :class="[severityClass(cause.priority), { active: cause.id === selectedId }]"
                type="button"
                @click="$emit('select', cause.id)"
            >
                <strong>{{ cause.priority }}</strong>
                <span>{{ cause.title }} {{ cause.count }}</span>
            </button>
        </template>
        <button v-else class="root-chip neutral" type="button">暂无高价值问题，保持监听中</button>
    </div>
</template>
