import { BRIDGE_METHODS } from '@/shared/constants.js';
import rrwebScript from '../../../../node_modules/rrweb/dist/rrweb.umd.min.cjs?raw';
import { wrapProbeInstaller } from '@/shared/utils/probe-installer.cjs';

/**
 * 探针注入和轮询 composable
 */
export function useProbe(cdpClient) {
    async function evaluate(expression) {
        return cdpClient.evaluate(expression);
    }

    async function injectProbe() {
        // Inject rrweb first via chunking to bypass 256KB CDP limit on some Android WebViews
        try {
            await evaluate(`window.__rrweb_code = '';`);
            const chunkSize = 100000;
            for (let i = 0; i < rrwebScript.length; i += chunkSize) {
                const chunk = rrwebScript.slice(i, i + chunkSize);
                await evaluate(`window.__rrweb_code += ${JSON.stringify(chunk)};`);
            }
            await evaluate(`
                try {
                    if (!window.rrweb) {
                        const s = document.createElement('script');
                        s.textContent = window.__rrweb_code;
                        const container = document.head || document.documentElement || document.body;
                        if (container) container.appendChild(s);
                    }
                } catch (e) {
                    console.warn('rrweb script injection error:', e);
                } finally {
                    delete window.__rrweb_code;
                }
            `);
        } catch (e) {
            console.warn('[probe] rrweb injection warning:', e.message);
        }

        // Then inject our probe
        try {
            await evaluate(wrapProbeInstaller(BRIDGE_METHODS));
        } catch (e) {
            console.warn('[probe] probe installer injection warning:', e.message);
        }

        // Start rrweb recording if supported
        try {
            await evaluate(`
                try {
                    if (window.rrweb && typeof window.__rrweb_emit === 'function') {
                        if (window.__rrweb_stop__) window.__rrweb_stop__();
                        window.__rrweb_stop__ = window.rrweb.record({
                            inlineImages: false,
                            recordCanvas: false,
                            collectFonts: false,
                            sampling: { canvas: 2 },
                            maskAllInputs: true,
                            maskInputOptions: {
                                password: true,
                                text: true,
                                email: true,
                                tel: true,
                                search: true,
                                number: true,
                                url: true
                            },
                            // Diagnostic replay retains interaction/layout evidence only. Mask
                            // every DOM text node so patient names, identifiers, and other
                            // free-form page content never leave the inspected WebView.
                            maskTextSelector: '*',
                            blockSelector: '[data-rr-block], .rr-block, iframe',
                            emit(event) {
                                try {
                                    if (window.__rrweb_emit) window.__rrweb_emit(JSON.stringify(event));
                                } catch (err) {}
                            }
                        });
                        window.__rrweb_started__ = true;
                    }
                } catch (e) {
                    console.warn('rrweb record start warning:', e);
                }
            `);
        } catch (e) {
            console.warn('[probe] rrweb start recording warning:', e.message);
        }
    }

    async function pollProbe() {
        const probe = await evaluate('window.__LOCAL_INSPECT_PROBE__ ? window.__LOCAL_INSPECT_PROBE__.dump() : null');
        return probe || null;
    }

    /**
     * 监听页面导航事件，主框架刷新后自动重新注入探针
     * @param {function} [onReinject] - 重注入成功后的回调
     */
    let reinjectRegistered = false;
    let unsub = null;
    function setupAutoReinject(onReinject) {
        if (reinjectRegistered) return;
        reinjectRegistered = true;
        unsub = cdpClient.onEvent('Page.frameNavigated', async (params) => {
            // 只处理主框架导航，忽略 iframe
            if (params.frame?.parentId) return;
            // 导航后等待页面初步加载
            await new Promise(r => setTimeout(r, 500));
            try {
                await injectProbe();
                onReinject?.();
            } catch (e) {
                // 页面可能还在加载，忽略错误
            }
        });
    }

    function dispose() {
        if (unsub) {
            unsub();
            unsub = null;
        }
        reinjectRegistered = false;
    }

    async function cleanupTarget() {
        try {
            await evaluate('window.__LOCAL_INSPECT_PROBE__?.dispose?.()');
        } catch (e) {
            console.warn('[probe] target cleanup warning:', e.message);
        }
    }

    return { injectProbe, pollProbe, setupAutoReinject, dispose, cleanupTarget };
}
