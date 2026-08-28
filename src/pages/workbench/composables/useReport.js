import { redact } from '../../../shared/utils/redact.js';
import { formatTime } from '../../../shared/utils/format.js';
import { toPlainValue } from '../../../shared/utils/diagnostic-run.mjs';

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

function publicTarget(config) {
    if (!config || typeof config !== 'object') return {};
    const { proxyToken, ...rest } = config;
    if (typeof rest.url === 'string') rest.url = redact(rest.url);
    return rest;
}

function redactPageUrls(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return snapshot || null;
    if (typeof snapshot.href === 'string') snapshot.href = redact(snapshot.href);
    if (typeof snapshot.hash === 'string') snapshot.hash = redact(snapshot.hash);
    return snapshot;
}

/**
 * 报告构建 composable
 */
export function useReport() {

    function buildReport({ config, profile, snapshot, events, causes, breadcrumbs, sourceStats, logcat, diagnosticRunId }) {
        const report = toPlainValue({
            createdAt: new Date().toISOString(),
            target: publicTarget(config),
            profile: profile ? { ...profile } : null,
            snapshot,
            events,
            causes,
            breadcrumbs,
            sourceMaps: { uploaded: sourceStats?.uploaded || 0, matched: sourceStats?.matched || 0 },
            logcat,
            diagnosticRunId: diagnosticRunId || ''
        });
        report.snapshot = redactPageUrls(report.snapshot);
        return report;
    }

    function fallbackTitle(phase) {
        if (/快照/.test(phase)) return '页面快照采集失败';
        if (/诊断报告|诊断会话/.test(phase)) return '诊断报告保存失败';
        if (/CDP|连接/.test(phase)) return 'CDP 连接失败';
        return `${phase}失败`;
    }

    function fallbackNext(phase) {
        if (/快照/.test(phase)) return '页面运行时对象包含不可克隆值，或页面在采集期间跳转/销毁。请重新采集，并优先查看上一条 JS/路由/网络事件。';
        if (/诊断报告|诊断会话/.test(phase)) return '诊断报告写入失败。请检查报告中是否包含不可序列化对象，并重试导出。';
        if (/CDP|连接/.test(phase)) return '确认目标 WebView 仍存在，关闭已连接的 DevTools 后重新采集，必要时重启 ADB 转发。';
        return '重新采集一次，并查看时间线中该阶段之前的最近事件。';
    }

    function fallbackReport(config, profile, error, phase = 'CDP 连接') {
        const message = error?.message || String(error || 'Unknown error');
        const cause = {
            id: `diagnostic:${phase}`,
            kind: 'bridge',
            priority: 'P0',
            title: fallbackTitle(phase),
            summary: message,
            owner: /CDP|连接/.test(phase) ? '调试连接' : '诊断采集',
            reason: `${phase}阶段失败：${message}`,
            next: fallbackNext(phase),
            evidence: [{ phase, error: message }],
            events: [],
            count: 1,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            source: null,
            trigger: '',
            related: [],
            stack: []
        };
        return toPlainValue({
            createdAt: new Date().toISOString(),
            target: publicTarget(config),
            profile: profile ? { ...profile } : null,
            snapshot: null,
            events: [],
            causes: [cause],
            breadcrumbs: [],
            sourceMaps: { uploaded: 0, matched: 0 },
            logcat: []
        });
    }

    function buildMarkdown(report) {
        if (!report) return '';
        const causes = Array.isArray(report.causes) ? report.causes : [];
        const breadcrumbs = Array.isArray(report.breadcrumbs) ? report.breadcrumbs : [];
        const related = relatedBreadcrumbs(causes[0] || { lastSeen: Date.now() }, breadcrumbs);
        const uploaded = report.sourceMaps?.uploaded ?? 0;
        const matched = report.sourceMaps?.matched ?? 0;
        const projectLabel = report.profile?.label || '通用 Web 应用';
        const pageUrl = redact(report.snapshot?.href || report.target?.url || '-');

        return [
            '# ztools 根因报告',
            '',
            `- 项目: ${projectLabel}`,
            `- 页面: ${pageUrl}`,
            `- SourceMap: 上传 ${uploaded} 个，匹配 ${matched} 个根因`,
            '',
            '## 根因',
            ...(causes.length
                ? causes.map(cause => {
                    const src = cause?.source?.mode === 'source-map'
                        ? `${cause.source.source}:${cause.source.line}:${cause.source.column}`
                        : cause?.source?.reason || '未匹配源码';
                    return `- ${cause?.priority || 'P1'} ${cause?.title || '未知问题'}: ${redact(cause?.summary || '')} | ${redact(cause?.next || '')} | ${src}`;
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
        const projectLabel = report?.profile?.label || '通用 Web 应用';
        const pageUrl = redact(report?.snapshot?.href || report?.target?.url || '-');
        return [
            `项目：${projectLabel}`,
            `页面：${pageUrl}`,
            `根因：${cause.priority || 'P1'} ${cause.title || '-'}`,
            `原因：${redact(cause.summary || '')}`,
            `触发：${cause.trigger || '-'}`,
            `源码：${cause.source?.mode === 'source-map' ? `${cause.source.source}:${cause.source.line}:${cause.source.column}` : cause.source?.reason || '未匹配'}`,
            `方向：${cause.owner || '-'}`,
            `下一步：${redact(cause.next || '')}`
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
