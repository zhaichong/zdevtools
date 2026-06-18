import { redact } from '@/shared/utils/redact.js';
import { formatTime } from '@/shared/utils/format.js';

const TYPE_LABELS = {
    network: '接口', js: 'JS', vue: 'Vue', resource: '资源',
    bridge: 'Bridge', route: '路由', click: '点击',
    console: 'Console', probe: '探针', 'low-signal': '低价值线索'
};

function typeLabel(type) {
    return TYPE_LABELS[type] || type || '事件';
}

function splitSteps(text) {
    const parts = String(text || '').split(/(?:\d+\.\s*)|[；;]/).map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : [String(text || '')];
}

/**
 * 报告构建 composable
 */
export function useReport() {

    function buildReport({ config, profile, snapshot, events, causes, breadcrumbs, sourceStats, logcat }) {
        return {
            createdAt: new Date().toISOString(),
            target: config,
            profile,
            snapshot,
            events,
            causes,
            breadcrumbs,
            sourceMaps: { uploaded: sourceStats.uploaded, matched: sourceStats.matched },
            logcat
        };
    }

    function fallbackReport(config, profile, error) {
        const cause = {
            id: 'cdp:connect-failed',
            kind: 'bridge',
            priority: 'P0',
            title: 'CDP 连接失败',
            summary: error.message,
            owner: '调试连接',
            reason: '工作台无法连接目标 WebView。',
            next: '关闭已连接的 DevTools 后重新采集，或重新打开工作台。',
            evidence: [{ error: error.message }],
            events: [],
            count: 1,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            source: null,
            trigger: '',
            related: [],
            stack: []
        };
        return {
            createdAt: new Date().toISOString(),
            target: config,
            profile,
            snapshot: null,
            events: [],
            causes: [cause],
            breadcrumbs: [],
            sourceMaps: { uploaded: 0, matched: 0 },
            logcat: []
        };
    }

    function buildMarkdown(report) {
        if (!report) return '';
        const related = relatedBreadcrumbs(report.causes[0] || { lastSeen: Date.now() }, report.breadcrumbs);
        return [
            '# Local Inspect 根因报告',
            '',
            `- 项目: ${report.profile.label}`,
            `- 页面: ${report.snapshot?.href || report.target?.url}`,
            `- SourceMap: 上传 ${report.sourceMaps.uploaded} 个，匹配 ${report.sourceMaps.matched} 个根因`,
            '',
            '## 根因',
            ...(report.causes.length
                ? report.causes.map(cause => {
                    const src = cause.source?.mode === 'source-map'
                        ? `${cause.source.source}:${cause.source.line}:${cause.source.column}`
                        : cause.source?.reason || '未匹配源码';
                    return `- ${cause.priority} ${cause.title}: ${redact(cause.summary)} | ${redact(cause.next)} | ${src}`;
                })
                : ['- 无']),
            '',
            '## 最近 120 秒',
            ...related.map(item => `- ${formatTime(item.time)} [${typeLabel(item.type)}] ${redact(item.message || '')}`),
            '',
            '## logcat',
            '```',
            redact((report.logcat || []).slice(-120).join('\n')),
            '```'
        ].join('\n');
    }

    function buildCauseText(cause, report) {
        if (!cause) return buildMarkdown(report);
        return [
            `项目：${report?.profile?.label || '-'}`,
            `页面：${report?.snapshot?.href || report?.target?.url}`,
            `根因：${cause.priority} ${cause.title}`,
            `原因：${redact(cause.summary)}`,
            `触发：${cause.trigger || '-'}`,
            `源码：${cause.source?.mode === 'source-map' ? `${cause.source.source}:${cause.source.line}:${cause.source.column}` : cause.source?.reason || '未匹配'}`,
            `方向：${cause.owner}`,
            `下一步：${redact(cause.next)}`
        ].join('\n');
    }

    function relatedBreadcrumbs(cause, breadcrumbs) {
        const last = cause.lastSeen || Date.now();
        const start = last - 120000;
        return (breadcrumbs || []).filter(item =>
            (item.time || 0) >= start && (item.time || 0) <= last + 2000
        ).slice(-30);
    }

    return { buildReport, fallbackReport, buildMarkdown, buildCauseText, typeLabel, splitSteps, relatedBreadcrumbs };
}
