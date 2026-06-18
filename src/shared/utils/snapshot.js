import { BRIDGE_METHODS } from '../constants.js';

/**
 * 生成运行时快照表达式（通过 CDP Runtime.evaluate 注入页面执行）
 * @returns {string}
 */
export function runtimeSnapshotExpression() {
    return `(() => {
            const pickStorage = (storage) => {
                const keys = ['webDebug','orgInfo','deptInfo','deviceInfo','patientInfo','loginInfo','IdlePerformance','httpException','nowRouter','diagnose','accessToken','token'];
                const data = {};
                for (const key of keys) {
                    try {
                        if (storage && storage.getItem(key) !== null) {
                            let value = storage.getItem(key);
                            if (/token|password|secret/i.test(key)) value = '[REDACTED]';
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
                if (route) vueRoute = { path: route.path, name: route.name || '', query: Object.keys(route.query || {}).join(','), params: Object.keys(route.params || {}).join(',') };
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
            const failedMedia = performance.getEntriesByType('resource')
                .filter(r => r.transferSize === 0 && !/^data:/.test(r.name) && /\\.(png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|otf)(\\?|$)/i.test(r.name))
                .map(r => ({ name: r.name.split('/').pop(), fullUrl: r.name, type: r.initiatorType }))
                .slice(-20);

            // 全局变量数量
            let globalVarCount = 0;
            try { globalVarCount = Object.keys(window).length; } catch (e) {}

            return {
                href: location.href,
                title: document.title,
                hash: location.hash,
                pathname: location.pathname,
                protocol: location.protocol,
                readyState: document.readyState,
                domNodes: document.getElementsByTagName('*').length,
                bodyTextLength: bodyText.length,
                isLikelyBlank: document.readyState === 'complete' && document.getElementsByTagName('*').length < 20 && bodyText.length < 20,
                hasVueRoot: !!vueRoot,
                vueVersion,
                vueRoute,
                memory,
                globalVarCount,
                userAgent: navigator.userAgent,
                language: navigator.language,
                onLine: navigator.onLine,
                screenWidth: screen.width,
                screenHeight: screen.height,
                devicePixelRatio: window.devicePixelRatio,
                globals: { android: !!window.android, websdk: !!window.websdk, zhbfbed: !!window.zhbfbed, zhctbed: !!window.zhctbed, globalConfig: !!window.globalConfig, mattressConfig: !!window.MATTRESS_API_CONFIG, mySdk: !!window.MySDK, log: typeof window.log === 'function' },
                androidMethods,
                storage: { local: pickStorage(window.localStorage), session: pickStorage(window.sessionStorage) },
                localStorageKeys: Object.keys(window.localStorage || {}),
                sessionStorageKeys: Object.keys(window.sessionStorage || {}),
                resourceFailures: performance.getEntriesByType('resource').filter(item => item.transferSize === 0 && !/^data:/.test(item.name)).slice(-30).map(item => ({ name: item.name, initiatorType: item.initiatorType, duration: Math.round(item.duration) })),
                failedMedia
            };
        })()`;
}
