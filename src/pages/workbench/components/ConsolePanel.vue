<script setup>
import { ref, nextTick } from 'vue';
import { formatTime } from '@/shared/utils/format.js';
import { redact } from '@/shared/utils/redact.js';

const props = defineProps({
    entries: { type: Array, default: () => [] },
    stats: { type: Object, default: () => ({ total: 0, errors: 0, warnings: 0 }) },
    filterLevel: { type: String, default: 'all' },
    searchText: { type: String, default: '' },
    paused: { type: Boolean, default: false },
    levelLabels: { type: Object, default: () => ({}) },
    onExecute: { type: Function, default: null }
});
const emit = defineEmits(['update:filterLevel', 'update:searchText', 'toggle-pause', 'clear']);

const expandedIds = ref(new Set());
const replInput = ref('');
const replHistory = ref([]);
const historyIndex = ref(-1);
</script>
