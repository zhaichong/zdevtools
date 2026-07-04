import { ref } from 'vue';
import { useCdpClient } from '@/shared/composables/useCdpClient.js';
import { identifyProject } from '@/shared/composables/useProjectIdentify.js';
import { runtimeSnapshotExpression } from '@/shared/utils/snapshot.js';
import { redact } from '@/shared/utils/redact.js';
import { decodeErrorPage, delay, nowTime } from '@/shared/utils/format.js';
import { extractStack, extractCallFrames } from '@/shared/utils/stack.js';
import { classifyError, classifyNetworkError } from '@/shared/utils/classify.js';

/**
 * Dashboard 快速诊断
 */
export function useQuickDiagnosis() {
    const diagnosisDetail = ref(null);
    const diagnosisByKey = new Map();
    const loading = ref(false);

    function normalizeEvent(payload) {
        const { method, params = {} } = payload;
        if (method === 'Runtime.exceptionThrown') {
            const details = params.exceptionDetails || {};
            return { type: 'runtime', severity: 'error', category: classifyError(details.text || details.exception?.description || ''), text: details.text || details.exception?.description || 'Runtime exception', url: details.url, stack: extractStack(details) };
        }
        if (method === 'Log.entryAdded') {
            const entry = params.entry || {};
            if (!['error', 'warning'].includes(entry.level)) return null;
            return { type: 'log', severity: entry.level === 'error' ? 'error' : 'warn', category: classifyError(entry.text || ''), text: entry.text || '', url: entry.url, stack: entry.stackTrace ? extractCallFrames(entry.stackTrace.callFrames) : [] };
        }
        if (method === 'Console.messageAdded') {
            const message = params.message || {};
            if (!['error', 'warning'].includes(message.level)) return null;
            return { type: 'console', severity: message.level === 'error' ? 'error' : 'warn', category: classifyError(message.text || ''), text: message.text || '', url: message.url, stack: [] };
        }
        if (method === 'Network.loadingFailed') {
            return { type: 'network', severity: 'error', category: classifyNetworkError(params.errorText || ''), requestId: params.requestId, text: params.errorText || 'Network loading failed' };
        }
        if (method === 'Network.responseReceived') {
            const response = params.response || {};
            if (response.status < 400) return null;
            return { type: 'network', severity: 'error', category: response.status === 404 ? '资源或接口 404' : '接口 HTTP 错误', requestId: params.requestId, url: response.url, status: response.status, text: `${response.status} ${response.statusText || ''}`.trim(), mimeType: response.mimeType };
        }
        return null;
    }

    function dedupeIssues(items) {
        const seen = new Set();
        return items.filter(item => {
            const stackKey = (item.stack || []).slice(0, 2).map(f => [f.url, f.lineNumber, f.columnNumber].join(':')).join('|');
            const key = [item.category, item.message || item.text, item.url, stackKey].join('::');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function dedupeNetwork(items) {
        const seen = new Set();
        return items.filter(item => {
            const key = [item.url || item.requestId, item.status || item.text, item.category].join('::');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function enrichEvent(event) {
        if (event.type === 'network') return event;
        const message = event.message || event.text || '';
        const stack = event.stack || [];
        const onlyAnonymous = /^Uncaught\s*$/i.test(message.trim()) && stack.length <= 1 && stack.every(f => !f.url && /anonymous/i.test(f.functionName || ''));
        if (onlyAnonymous) {
            return { ...event, severity: 'warn', category: '匿名运行时事件', lowSignal: true, action: '没有业务文件、函数名或真实堆栈。请优先看工作台里的接口、Bridge、路由和时间线。' };
        }
        return event;
    }

    function analyzeSnapshot(snapshot, profile = {}) {
        if (!snapshot) return [];
        const findings = [];
        if (snapshot.isLikelyBlank) findings.push({ severity: 'error', category: '白屏迹象', message: '页面已完成加载，但 DOM 和文本内容非常少。', action: '先看入口 JS/chunk，再检查启动接口和 Android bridge 初始化。' });
        if (snapshot.href?.includes('error.html')) findings.push({ severity: 'error', category: '启动异常页', message: decodeErrorPage(snapshot.href), action: '解析 error.html 的 err 参数，再回溯启动接口和路由参数。' });
        if (!snapshot.globals?.android) {
            findings.push({ severity: 'warn', category: 'Android bridge 缺失', message: 'window.android 不存在。', action: '如果是在设备 WebView 内，先确认 Android 是否注入 addJavascriptInterface。' });
        } else {
            const missing = Object.entries(snapshot.androidMethods || {}).filter(([, ok]) => !ok).map(([name]) => name);
            if (missing.length) findings.push({ severity: 'warn', category: 'Android bridge 方法缺失', message: `缺少方法：${missing.join(', ')}`, action: bridgeAction(missing, profile) });
        }
        if (snapshot.resourceFailures?.length) findings.push({ severity: 'warn', category: '资源疑似失败', message: `performance 中发现 ${snapshot.resourceFailures.length} 个 transferSize=0 的资源。`, action: '展开工作台资源失败，检查 JS/CSS/图片是否 404 或缓存未更新。' });
        return findings;
    }

    function bridgeAction(missing, profile = {}) {
        if (profile.id === 'yarward-ntv-frontend') return '确认 MySDK、getDeviceInfo、getOrgId、getAccessToken 和 launchFinished 调用时机。';
        if (profile.id === 'zhbf-bedhead-frontend') return '确认 writeLog、getDeviceInfo、getOrgId、getAccessToken 是否由 Android 注入。';
        if (profile.id === 'zhbf-fontend') return '确认 pageLoadFinished、toLogInE 和 token/orgId 获取方法是否存在。';
        return `确认 Android 注入的方法是否和前端调用一致：${missing.join(', ')}。`;
    }

    function actionForIssue(issue, profile = {}, snapshot = {}) {
        const category = issue.category || '';
        const message = issue.message || issue.text || '';
        if (issue.lowSignal) return issue.action;
        if (/路由懒加载/.test(category)) return '检查 chunk 是否 404、设备缓存是否未清、入口 HTML 是否仍引用旧资源。';
        if (/Vue/.test(category)) return '按堆栈第一条业务文件定位组件，同时检查当前路由参数和接口返回结构。';
        if (/接口|HTTP|Network/.test(category + message)) return '确认 baseURL、orgId/deptId、token、网关和后端服务状态。';
        if (/资源/.test(category)) return '看失败资源是 JS/CSS/图片；JS chunk 失败通常导致白屏或功能缺失。';
        if (/Android bridge/.test(category)) return bridgeAction([], profile);
        if (snapshot?.href?.includes('/ntv/')) return '优先检查 launch.html/launchFinished、globalConfig、MATTRESS_API_CONFIG 和 MQTT 初始化。';
        return '结合工作台中的 Network、时间线、快照和 logcat 判断启动链路。';
    }

    function buildGuidance({ profile, snapshot, errors, network }) {
        const guidance = [];
        const add = (level, title, reason, next) => guidance.push({ level, title, reason, next });
        const meaningfulErrors = errors.filter(i => !i.lowSignal);
        const lowSignalCount = errors.filter(i => i.lowSignal).length;
        const missingBridge = snapshot?.globals?.android ? Object.entries(snapshot.androidMethods || {}).filter(([, ok]) => !ok).map(([name]) => name) : [];
        if (snapshot?.href?.includes('error.html')) add('danger', '先查启动异常页参数', '当前已经进入 error.html。', '复制页面 URL，解析 err 参数；检查进入异常页前的接口、bridge 返回值和路由参数。');
        if (snapshot?.isLikelyBlank) add('danger', '先按白屏排查', '页面 readyState 已完成但 DOM/文本很少。', '看入口 JS/chunk 是否加载失败，再查 Vue 挂载、路由守卫和启动接口。');
        if (network.length) add('danger', '先处理失败请求', `采集到 ${network.length} 个 Network 失败。`, `优先看 ${network[0].status || network[0].text || 'failed'}：${redact(network[0].url || network[0].requestId || '')}`);
        if (!snapshot?.globals?.android) add('warning', '确认运行环境是否缺少 Android bridge', '页面未检测到 window.android。', '设备 WebView 内确认 addJavascriptInterface 注入；Chrome 预览时用 mock bridge。');
        else if (missingBridge.length) add('warning', '补齐或兼容缺失的 bridge 方法', `window.android 存在，但缺少 ${missingBridge.join(', ')}。`, bridgeAction(missingBridge, profile));
        if (snapshot?.resourceFailures?.length) add('warning', '检查静态资源加载', `performance 记录到 ${snapshot.resourceFailures.length} 个疑似失败资源。`, `先查 ${snapshot.resourceFailures[0].initiatorType || 'resource'}：${snapshot.resourceFailures[0].name}`);
        if (meaningfulErrors.length) add('warning', `定位 ${meaningfulErrors[0].category}`, meaningfulErrors[0].message || '采集到有业务意义的运行时错误。', meaningfulErrors[0].action || actionForIssue(meaningfulErrors[0], profile, snapshot));
        if (profile.id === 'yarward-ntv-frontend') add('info', '按 NurseNtv 启动链路复核', '当前识别为 yarward-ntv 页面。', '依次确认 URL orgId/deptId/devId、globalConfig、MATTRESS_API_CONFIG、MySDK、MQTT 日志。');
        if (profile.id === 'zhbf-bedhead-frontend') add('info', '按床头卡链路复核', '当前识别为床头卡页面。', '打开 webDebug 后复现，重点看 writeLog/logcat、床头卡接口和 IdlePerformance。');
        if (profile.id === 'zhbf-fontend') add('info', '按信息看板链路复核', '当前识别为 zhbf-fontend。', '先查 ApiBase 请求和 token/orgId，再确认 pageLoadFinished/toLogInE。');
        if (!guidance.length && lowSignalCount) add('info', '当前只有低价值匿名错误', `采集到 ${lowSignalCount} 条 Uncaught/<anonymous>，没有业务堆栈。`, '进入调试工作台，结合时间线、Network、Bridge 和 logcat 排查。');
        return guidance.slice(0, 6);
    }

    function buildQuickDiagnosis({ device, proc, target, snapshot, profile, events, logcat }) {
        const runtime = dedupeIssues(events.filter(e => e.type !== 'network').map(enrichEvent));
        const network = dedupeNetwork(events.filter(e => e.type === 'network'));
        const context = analyzeSnapshot(snapshot, profile);
        const errors = [...context, ...runtime].map(item => ({
            severity: item.severity || 'error',
            category: item.category || '运行时上下文',
            message: item.message || item.text || '',
            url: item.url,
            stack: item.stack || [],
            lowSignal: !!item.lowSignal,
            action: item.action || actionForIssue(item, profile, snapshot)
        }));
        const guidance = buildGuidance({ profile, snapshot, errors, network });
        return {
            finishedAt: nowTime(),
            device: { id: device.id, model: device.model, manufacturer: device.manufacturer, androidVersion: device.androidVersion, sdkVersion: device.sdkVersion },
            proc: { processName: proc.processName, processHint: proc.processHint, localPort: proc.localPort },
            target, profile,
            summary: {
                errorCount: errors.filter(i => i.severity === 'error' && !i.lowSignal).length + network.length,
                warningCount: errors.filter(i => i.severity === 'warn' || i.lowSignal).length,
                networkFailures: network.length,
                likelyBlank: snapshot?.isLikelyBlank || false
            },
            guidance, errors, network, snapshot, logcat
        };
    }

    async function runDiagnosis(device, proc, target) {
        loading.value = true;
        diagnosisDetail.value = { loading: true, hint: `${device.model || device.id} · ${target.title || target.url || target.id}`, message: '正在连接 CDP 并采集页面错误...' };

        const client = useCdpClient(proc.localPort, target.id);
        try {
            await client.connect();
            await client.enable();
            await delay(2600);
            const snapshot = await client.evaluate(runtimeSnapshotExpression()) || {};
            const logcat = [];
            const profile = identifyProject(target.url, snapshot, client.events.value);
            const diagnosis = buildQuickDiagnosis({ device, proc, target, snapshot, profile, events: client.events.value, logcat });
            const key = `${target.deviceId || ''}:${proc.localPort}:${target.id}`;
            diagnosisByKey.set(key, diagnosis);
            diagnosisDetail.value = { loading: false, diagnosis };
        } catch (error) {
            const profile = identifyProject(target.url);
            const diagnosis = {
                finishedAt: nowTime(), device, proc, target, profile,
                summary: { errorCount: 1, warningCount: 0, networkFailures: 0, likelyBlank: false },
                guidance: [{ level: 'danger', title: 'CDP 连接失败', reason: error.message, next: '关闭已打开的 DevTools 后重试，或进入调试工作台查看连接状态。' }],
                errors: [{ category: 'CDP 连接失败', message: error.message, severity: 'error', stack: [] }],
                network: [], snapshot: null, logcat: []
            };
            diagnosisDetail.value = { loading: false, diagnosis };
        } finally {
            client.removeAllListeners();
            client.close();
            loading.value = false;
        }
    }

    function getDiagnosisForTarget(target, proc) {
        const key = `${target.deviceId || ''}:${proc.localPort}:${target.id}`;
        return diagnosisByKey.get(key) || null;
    }

    return { diagnosisDetail, runDiagnosis, getDiagnosisForTarget };
}
