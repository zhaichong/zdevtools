import { BRIDGE_METHODS } from '../constants.js';
import { buildRedactSource } from './redact-source.js';

/**
 * 生成运行时快照表达式（通过 CDP Runtime.evaluate 注入页面执行）
 * @returns {string}
 */
export function runtimeSnapshotExpression({ storageKeys = [], globalFlags = [] } = {}) {
    // 回退到默认值（如果在未获取到 profile 配置的情况下）
    const finalStorageKeys = storageKeys.length ? storageKeys : ['webDebug','orgInfo','deptInfo','deviceInfo','patientInfo','loginInfo','IdlePerformance','httpException','nowRouter','diagnose','accessToken','token'];
    const finalGlobalFlags = globalFlags.length ? globalFlags : ['android','websdk','zhbfbed','zhctbed','globalConfig','MATTRESS_API_CONFIG','MySDK'];

    return `(() => {
            ${buildRedactSource()}
            
            const pickStorage = (storage) => {
                const keys = ${JSON.stringify(finalStorageKeys)};
                const data = {};
                for (const key of keys) {
                    try {
                        if (storage && storage.getItem(key) !== null) {
                            let value = storage.getItem(key);
                            // 用统一下发的 redact，不再手写内联正则
                            value = redact(value);
                            data[key] = value && value.length > 500 ? value.slice(0, 500) + '...' : value;
                        }
                    } catch (e) {}
                }
                return data;
            };
            const bridgeMethods = ${JSON.stringify(BRIDGE_METHODS)};
            const androidMethods = {};
            for (const name of bridgeMethods) {
                try { androidMethods[name] = !!(window.android && typeof window.android[name] === 'function'); } catch (e) { androidMethods[name] = false; }
            }
            const bodyText = (document.body && document.body.innerText || '').trim();
            const vueRoot = document.querySelector('#app') || document.querySelector('[data-server-rendered]');

            // Vue 版本和路由
            const vueApp = vueRoot?.__vue_app__;
            const vue2Root = vueRoot?.__vue__;
            const vueVersion = vueApp?.version || vue2Root?.constructor?.version || null;
            let vueRoute = null;
            try {
                const route = vueApp?.config?.globalProperties?.$route || vue2Root?.$route;
                if (route) vueRoute = {
                    path: route.path == null ? '' : String(route.path),
                    name: route.name == null ? '' : String(route.name),
                    query: Object.keys(route.query || {}).join(','),
                    params: Object.keys(route.params || {}).join(',')
                };
            } catch (e) {}

            // 内存信息（Chrome 专属）
            let memory = null;
            try {
                if (performance.memory) {
                    memory = {
                        usedJSHeapSize: performance.memory.usedJSHeapSize,
                        totalJSHeapSize: performance.memory.totalJSHeapSize,
                        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
                    };
                }
            } catch (e) {}

            // 图片/字体加载失败
            let failedMedia = [];
            try {
                if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
                    failedMedia = performance.getEntriesByType('resource')
                        .filter(r => r.transferSize === 0 && !/^data:/.test(r.name) && /\.(png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|otf)(\?|$)/i.test(r.name))
                        .map(r => ({ name: r.name.split('/').pop(), fullUrl: r.name, type: r.initiatorType }))
                        .slice(-20);
                }
            } catch (e) {}

            // 全局变量数量
            let globalVarCount = 0;
            try { globalVarCount = Object.keys(window).length; } catch (e) {}

            let localStorageKeys = [];
            let sessionStorageKeys = [];
            try { localStorageKeys = Object.keys(window.localStorage || {}); } catch (e) {}
            try { sessionStorageKeys = Object.keys(window.sessionStorage || {}); } catch (e) {}
            
            // 组装要被检查的对象字典
            const globals = { log: typeof window.log === 'function' };
            const flagKeys = ${JSON.stringify(finalGlobalFlags)};
            for (const key of flagKeys) {
                try { globals[key] = !!window[key]; } catch(e) {}
            }

            let resourceFailures = [];
            try {
                if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
                    resourceFailures = performance.getEntriesByType('resource')
                        .filter(item => item.transferSize === 0 && !/^data:/.test(item.name))
                        .slice(-30)
                        .map(item => ({ name: item.name, initiatorType: item.initiatorType, duration: Math.round(item.duration) }));
                }
            } catch (e) {}

            let snapshot = {};
            try {
                snapshot = {
                    href: typeof location !== 'undefined' ? redact(location.href || '') : '',
                    title: typeof document !== 'undefined' ? redact(document.title || '') : '',
                    hash: typeof location !== 'undefined' ? redact(location.hash || '') : '',
                    pathname: typeof location !== 'undefined' ? location.pathname : '',
                    protocol: typeof location !== 'undefined' ? location.protocol : '',
                    readyState: typeof document !== 'undefined' ? document.readyState : '',
                    domNodes: typeof document !== 'undefined' ? document.getElementsByTagName('*').length : 0,
                    bodyTextLength: bodyText.length,
                    isLikelyBlank: typeof document !== 'undefined' && document.readyState === 'complete' && document.getElementsByTagName('*').length < 20 && bodyText.length < 20,
                    hasVueRoot: !!vueRoot,
                    vueVersion,
                    vueRoute,
                    memory,
                    globalVarCount,
                    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                    language: typeof navigator !== 'undefined' ? navigator.language : '',
                    onLine: typeof navigator !== 'undefined' ? navigator.onLine : false,
                    screenWidth: (typeof screen !== 'undefined' && screen.width) || (typeof window !== 'undefined' && window.innerWidth) || 0,
                    screenHeight: (typeof screen !== 'undefined' && screen.height) || (typeof window !== 'undefined' && window.innerHeight) || 0,
                    devicePixelRatio: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
                    globals,
                    androidMethods,
                    storage: { local: typeof window !== 'undefined' ? pickStorage(window.localStorage) : {}, session: typeof window !== 'undefined' ? pickStorage(window.sessionStorage) : {} },
                    localStorageKeys,
                    sessionStorageKeys,
                    resourceFailures,
                    failedMedia
                };
            } catch (e) {
                snapshot.error = String(e);
            }
            return JSON.parse(JSON.stringify(snapshot));
        })()`;
}
