import { redact } from '@/shared/utils/redact.js';
import { sourceHint } from '@/shared/utils/format.js';
import { normalizeStack, parseStackText, extractStack, extractCallFrames } from '@/shared/utils/stack.js';
import { classifyError } from '@/shared/utils/classify.js';
import { decodeErrorPage } from '@/shared/utils/format.js';

function fingerprint(text) { return String(text || '').replace(/\d+/g, '#').slice(0, 160); }
function topFrameKey(stack) { const f = stack?.[0]; return f ? `${f.url || ''}:${f.lineNumber || ''}:${f.columnNumber || ''}` : ''; }
function severityRank(p) { return ({ P0: 0, P1: 1, P2: 2, P3: 3 }[p] ?? 9); }
function normalizeUrl(url, snapshotHref) {
    try { const parsed = new URL(url, snapshotHref || location.href); const keep = new URLSearchParams(); for (const key of ['orgId', 'deptId', 'devId']) if (parsed.searchParams.has(key)) keep.set(key, parsed.searchParams.get(key)); return `${parsed.origin}${parsed.pathname}${keep.toString() ? `?${keep}` : ''}`; } catch (e) { return String(url || '').replace(/([?&])((?:access_)?token|password|client_secret|Authorization)=[^&]+/gi, '$1$2=[REDACTED]'); }
}

function compactEvent(item) { return { source: item.source, method: item.method, status: item.status, url: item.url, message: item.message, category: item.category, stack: (item.stack || []).slice(0, 4), duration: item.duration, componentName: item.componentName, info: item.info }; }

function makeCause(data) { return { count: 1, firstSeen: Date.now(), lastSeen: Date.now(), source: null, ...data }; }

function normalizeEventForCause(item) {
    const message = item.message || item.text || item.error || '';
    const stack = normalizeStack(item.stack, message);
    const type = item.type === 'vue' || /Vue warn|errorHandler|nextTick|render function/i.test(message) ? 'vue' : item.type;
    return { ...item, type, message, stack, category: item.category || classifyError(message), time: item.time || Date.now() };
}

function dedupeEvents(items) {
    const seen = new Set();
    return items.filter(item => { const key = [item.type, item.method, normalizeUrl(item.url || item.message || ''), item.status || item.error || '', item.message || ''].join('::'); if (seen.has(key)) return false; seen.add(key); return true; });
}

function dedupeBreadcrumbs(items) {
    const seen = new Set();
    return items.filter(item => { const key = [Math.floor((item.time || 0) / 1000), item.type, item.message].join('::'); if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => (a.time || 0) - (b.time || 0));
}

function inferTrigger(stack, message = '') {
    const all = [...(stack || []).map(f => f.functionName).filter(Boolean), message];
    const text = all.join(' ');
    const known = text.match(/(_onMattressDataReceived|onMattressDataReceived|launchFinished|pageLoadFinished|HANDWRITINGCOMMAND|ROLL_DEPT|writeLog|toLogInE)/i);
    if (known) return known[1];
    const frame = (stack || []).find(item => item.functionName && !/anonymous|<anonymous>/i.test(item.functionName));
    return frame?.functionName || '';
}

function inferOwnerForGlobal(name) {
    if (/ROLL_DEPT|HANDWRITING|MATTRESS/i.test(name)) return '前端初始化 / Android Bridge / 床垫模块';
    if (/SDK|COMMAND|BRIDGE/i.test(name)) return 'Android Bridge / 容器注入';
    return '前端全局对象 / 初始化顺序';
}

function explainGlobal(name, event) {
    const trigger = inferTrigger(event.stack || [], event.message);
    if (/ROLL_DEPT/i.test(name)) return `床垫数据链路调用 window.${name}，但当前页面没有该函数。${trigger ? `触发点是 ${trigger}。` : ''}`;
    if (/HANDWRITINGCOMMAND/i.test(name)) return `手写板或 Android 命令链路调用 window.${name}，但当前页面没有该函数。${trigger ? `触发点是 ${trigger}。` : ''}`;
    return `代码调用 window.${name}，但该全局函数未注册或注册晚于调用时机。`;
}

function nextForGlobal(name) {
    if (/ROLL_DEPT|HANDWRITINGCOMMAND/i.test(name)) return '1. 在 Console 执行 typeof window.' + name + '；2. 确认该方法由前端脚本还是 Android 注入；3. 检查 launchFinished 前是否提前收到 MQTT/床垫数据；4. 检查模块初始化顺序和 chunk 版本。';
    return '1. 确认全局函数注册位置；2. 检查调用时机是否早于注册；3. 检查入口 HTML 和 chunk 是否同版本。';
}

function causesFromEvent(event, snapshotHref) {
    const message = event.message || '';
    const causes = [];
    const windowMatch = message.match(/window\.([A-Za-z_$][\w$]*)\s+is not a function/i);
    if (windowMatch) {
        const name = windowMatch[1];
        causes.push(makeCause({ id: 'global-method:missing', kind: 'js', priority: 'P0', title: '全局函数缺失', summary: `window.${name} 未定义或不是函数。`, owner: inferOwnerForGlobal(name), reason: explainGlobal(name, event), next: nextForGlobal(name), methods: [`window.${name}`], evidence: [compactEvent(event)], events: [event] }));
        return causes;
    }
    const methodMatch = message.match(/([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)\s+is not a function/i);
    if (methodMatch) { causes.push(makeCause({ id: `method-missing:${methodMatch[1]}`, kind: 'js', priority: 'P1', title: '工具函数或对象方法缺失', summary: `${methodMatch[1]} 不存在或不是函数。`, owner: '前端公共工具 / 数据结构', reason: '调用对象方法时对象结构不符合预期，常见原因是公共工具未加载、接口返回结构变化或 chunk 版本不一致。', next: '检查公共 utils/polyfill 是否加载，确认接口返回结构，并排查入口 HTML 与 chunk 是否同一版本。', evidence: [compactEvent(event)], events: [event] })); return causes; }
    if (/WebSocket connection .*mqtt|mqtt.*failed|MQTT.*离线|MQTT.*关闭|mqtt.*close/i.test(message)) { const url = message.match(/wss?:\/\/[^\s'"]+/i)?.[0] || event.url || ''; causes.push(makeCause({ id: `mqtt:${normalizeUrl(url || message, snapshotHref)}`, kind: 'network', priority: 'P0', title: 'MQTT 连接失败', summary: url ? `${url} 连接失败或关闭。` : 'MQTT 连接失败或客户端离线。', owner: 'MQTT 服务 / 网络 / 床垫网关', reason: '床垫或护理大屏依赖 MQTT 推送，连接失败会导致数据回调异常或页面状态不完整。', next: '检查 MQTT 服务、端口 8083、防火墙、设备网络、床垫网关状态和 WebView 对 ws 协议的访问。', evidence: [compactEvent(event)], events: [event] })); return causes; }
    if (event.type === 'network' && (event.status >= 400 || /ERR_|failed|timeout/i.test(message))) { causes.push(makeCause({ id: `api:${event.method || 'GET'}:${normalizeUrl(event.url || event.message, snapshotHref)}:${event.status || message}`, kind: 'network', priority: event.status >= 500 ? 'P0' : 'P1', title: event.status ? `接口 ${event.status}` : '接口请求失败', summary: `${event.method || 'GET'} ${event.status || message} ${redact(event.url || event.requestId || '')}`, owner: '后端接口 / 网关 / 参数', reason: '接口失败可能导致后续渲染、初始化或回调逻辑拿到空数据。', next: '确认 baseURL、orgId/deptId/devId、token、网关和后端服务状态。', evidence: [compactEvent(event)], events: [event] })); return causes; }
    if (event.type === 'resource' || /ChunkLoadError|Loading chunk|net::ERR_ABORTED|\.js.*404/i.test(message)) { causes.push(makeCause({ id: `resource:${normalizeUrl(event.url || message, snapshotHref)}`, kind: 'resource', priority: 'P1', title: '静态资源或 chunk 失败', summary: redact(event.url || message), owner: '前端静态资源 / 缓存', reason: '资源或 chunk 加载失败会导致函数缺失、路由无法进入或页面白屏。', next: '检查入口 HTML 和 chunk 是否同版本，清理设备缓存，确认 JS/CSS/map 文件是否可访问。', evidence: [compactEvent(event)], events: [event] })); return causes; }
    if (event.type === 'vue') { causes.push(makeCause({ id: `vue:${fingerprint(message)}:${topFrameKey(event.stack)}`, kind: 'vue', priority: 'P1', title: 'Vue 组件异常', summary: redact(message), owner: '前端组件 / 接口数据', reason: 'Vue 组件渲染或生命周期出现异常，常和 props、接口返回结构或初始化顺序有关。', next: '定位组件名和 info，结合最近接口、路由和点击事件排查。', evidence: [compactEvent(event)], events: [event] })); return causes; }
    if (event.type === 'js' && message) { const lowSignal = /^Uncaught\s*$/i.test(message.trim()) && !event.stack?.some(f => f.url); causes.push(makeCause({ id: `${lowSignal ? 'low' : 'js'}:${fingerprint(message)}:${topFrameKey(event.stack)}`, kind: lowSignal ? 'low-signal' : 'js', priority: lowSignal ? 'P3' : 'P1', title: lowSignal ? '低价值匿名错误' : 'JS 运行时错误', summary: redact(message), owner: '前端运行时', reason: lowSignal ? '没有业务堆栈或源码位置，不能单独定位。' : '运行时异常导致当前调用链中断。', next: lowSignal ? '优先看接口、Bridge、路由和时间线。' : '按堆栈和 SourceMap 定位源码，再结合最近 30 秒上下文判断触发原因。', evidence: [compactEvent(event)], events: [event] })); }
    return causes;
}

function contextCauses(snapshot, snapshotHref) {
    const causes = [];
    if (!snapshot) return causes;
    if (snapshot.isLikelyBlank) causes.push(makeCause({ id: 'context:blank', kind: 'bridge', priority: 'P0', title: '疑似白屏', summary: '页面已加载完成，但 DOM 和文本内容非常少。', owner: '前端启动链路', reason: '入口渲染链路没有正常完成。', next: '检查入口 JS/chunk、Vue 挂载、路由守卫和启动接口。', evidence: [snapshot], events: [] }));
    if (snapshot.href?.includes('error.html')) causes.push(makeCause({ id: 'context:error-html', kind: 'bridge', priority: 'P0', title: '进入 error.html', summary: decodeErrorPage(snapshot.href), owner: '前端启动链路', reason: '业务主动跳转到错误页。', next: '解析 err 参数，回溯进入错误页前的接口、Bridge 和路由参数。', evidence: [{ href: snapshot.href }], events: [] }));
    if (!snapshot.globals?.android) causes.push(makeCause({ id: 'bridge:missing-window', kind: 'bridge', priority: 'P1', title: 'Android Bridge 缺失', summary: 'window.android 不存在。', owner: 'Android 容器 / WebView', reason: '设备 WebView 内缺少 bridge 会导致取 token、设备信息、页面完成通知失败。', next: '确认 Android 是否调用 addJavascriptInterface 注入 window.android。', evidence: [snapshot.globals], events: [] }));
    else { const missing = Object.entries(snapshot.androidMethods || {}).filter(([, ok]) => !ok).map(([name]) => name); if (missing.length) causes.push(makeCause({ id: `bridge:missing-methods:${missing.join(',')}`, kind: 'bridge', priority: 'P1', title: 'Bridge 方法缺失', summary: `缺少：${missing.join(', ')}`, owner: 'Android Bridge / 前端兼容', reason: '前端可能调用了当前 Android 容器未提供的方法。', next: bridgeNext(missing), evidence: [snapshot.androidMethods], events: [] })); }
    for (const item of snapshot.resourceFailures || []) causes.push(makeCause({ id: `resource:performance:${normalizeUrl(item.name, snapshotHref)}`, kind: 'resource', priority: 'P2', title: '资源疑似未加载', summary: item.name, owner: '静态资源 / 缓存', reason: 'performance 中出现 transferSize=0 的资源。', next: '确认资源是否 404、缓存是否过期或被 WebView 拦截。', evidence: [item], events: [] }));
    return causes;
}

function bridgeNext(missing, profileId) {
    if (profileId === 'yarward-ntv-frontend') return '确认 MySDK、getDeviceInfo、getOrgId、getAccessToken 和 launchFinished 调用时机。';
    if (profileId === 'zhbf-bedhead-frontend') return '确认 writeLog、getDeviceInfo、getOrgId、getAccessToken 是否由 Android 注入。';
    if (profileId === 'zhbf-fontend') return '确认 pageLoadFinished、toLogInE 和 token/orgId 获取方法是否存在。';
    return `确认 Android 注入的方法是否和前端调用一致：${missing.join(', ')}。`;
}

/**
 * 构建根因分析 composable
 */
export function useRootCauses() {
    // 缓存已计算的 related，避免 poll 时窗口漂移导致上下文丢失
    const relatedCache = new Map();

    function buildRootCauses(rawEvents, snapshot, snapshotHref, profileId, breadcrumbs) {
        const events = dedupeEvents(rawEvents.map(normalizeEventForCause));
        const buckets = new Map();
        for (const event of events) {
            for (const cause of causesFromEvent(event, snapshotHref)) {
                const existing = buckets.get(cause.id) || cause;
                if (existing !== cause) { existing.count += 1; existing.lastSeen = Math.max(existing.lastSeen, cause.lastSeen); existing.evidence.push(...cause.evidence); existing.events.push(...cause.events); existing.methods = [...new Set([...(existing.methods || []), ...(cause.methods || [])])]; }
                buckets.set(existing.id, existing);
            }
        }
        for (const cause of contextCauses(snapshot, snapshotHref)) {
            const existing = buckets.get(cause.id) || cause;
            if (existing !== cause) { existing.count += cause.count; existing.evidence.push(...cause.evidence); }
            buckets.set(existing.id, existing);
        }
        const causes = [...buckets.values()].map(cause => {
            if (cause.methods?.length) {
                cause.summary = `${cause.methods.join('、')} 未定义或不是函数。`;
                cause.reason = `${cause.methods.join('、')} 被业务调用，但当前页面没有这些全局函数。常见原因是 Android/业务脚本未注入、注入晚于调用，或入口 HTML 与 chunk 版本不一致。`;
                cause.next = `1. 在 Console 分别执行 ${cause.methods.map(m => `typeof ${m}`).join('、')}；2. 确认这些方法由前端脚本还是 Android 注入；3. 检查 launchFinished 前是否提前收到 MQTT/床垫数据；4. 检查模块初始化顺序和 chunk 版本。`;
                cause.owner = cause.methods.some(m => /ROLL_DEPT|HANDWRITING|COMMAND/i.test(m)) ? '前端初始化 / Android Bridge / 床垫或手写板模块' : cause.owner;
            }
            const stack = cause.events.flatMap(e => normalizeStack(e.stack, e.message));
            const trigger = inferTrigger(stack, cause.summary);
            // 如果已有缓存的 related，保持不变（避免 poll 时窗口漂移丢失上下文）
            let related;
            if (relatedCache.has(cause.id)) {
                related = relatedCache.get(cause.id);
            } else {
                related = (breadcrumbs || []).filter(item =>
                    (item.time || 0) >= (cause.lastSeen || Date.now()) - 120000 &&
                    (item.time || 0) <= (cause.lastSeen || Date.now()) + 2000
                ).slice(-60);
                relatedCache.set(cause.id, related);
            }
            return { ...cause, trigger, related, evidence: cause.evidence.slice(-6), stack: stack.slice(0, 8) };
        });
        return causes.sort((a, b) => severityRank(a.priority) - severityRank(b.priority) || b.count - a.count || b.lastSeen - a.lastSeen);
    }

    function buildBreadcrumbs(probeBreadcrumbs, events) {
        return dedupeBreadcrumbs([
            ...(probeBreadcrumbs || []),
            ...events.map(event => ({ time: event.time || Date.now(), type: event.type, message: event.message || event.url || event.title || '', data: compactEvent(event) }))
        ]).slice(-240);
    }

    return { buildRootCauses, buildBreadcrumbs, dedupeEvents, normalizeEventForCause, relatedCache };
}
