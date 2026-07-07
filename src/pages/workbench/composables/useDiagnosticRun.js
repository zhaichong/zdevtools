import { ref } from 'vue';
import { buildDiagnosticRun, makeEvidenceEvent, toPlainValue } from '@/shared/utils/diagnostic-run.mjs';
import { LRUCache } from '@/shared/utils/ring-buffer.js';

export function useDiagnosticRun(config) {
    const runId = ref('');
    const savedRun = ref(null);
    const lastEventIds = new LRUCache({ maxSize: 10000 });

    async function createRun(profile) {
        const api = window.electronAPI;
        if (!api?.createDiagnosticRun || runId.value) return runId.value;
        const result = await api.createDiagnosticRun(toPlainValue({
            target: { ...config },
            profile: profile ? { ...profile } : null
        }));
        runId.value = result?.runId || '';
        return runId.value;
    }

    async function persistReport(report) {
        const api = window.electronAPI;
        if (!api?.appendDiagnosticEvidence || !report) return;
        if (!runId.value) await createRun(report.profile);
        if (!runId.value) return;

        const plainReport = toPlainValue(report);
        const run = buildDiagnosticRun({
            runId: runId.value,
            target: plainReport.target,
            profile: plainReport.profile,
            report: plainReport
        });
        savedRun.value = run;

        const freshEvents = run.events
            .map(makeEvidenceEvent)
            .filter(event => {
                if (lastEventIds.has(event.id)) return false;
                lastEventIds.set(event.id, true);
                return true;
            });

        await api.appendDiagnosticEvidence(runId.value, toPlainValue({
            events: freshEvents,
            report: { ...plainReport, causes: run.causes, diagnosticRunId: runId.value }
        }));
    }

    async function loadRun(id = runId.value) {
        const api = window.electronAPI;
        if (!api?.getDiagnosticRun || !id) return null;
        savedRun.value = await api.getDiagnosticRun(id);
        return savedRun.value;
    }

    async function exportRun(id = runId.value) {
        const api = window.electronAPI;
        if (!api?.exportDiagnosticRun || !id) return '';
        return api.exportDiagnosticRun(id);
    }

    return { runId, savedRun, createRun, persistReport, loadRun, exportRun };
}
