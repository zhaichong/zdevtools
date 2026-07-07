import { ref, computed } from 'vue';
import {
    normalizeRequestWillBeSent,
    normalizeResponseReceived,
    normalizeLoadingFinished,
    normalizeLoadingFailed
} from '@/shared/utils/cdp-events.js';

const MAX_REQUESTS = 500;

/**
 * Real-time network monitor composable (Flipper-inspired)
 * Tracks request lifecycle: requestWillBeSent -> responseReceived -> loadingFinished/Failed
 * @param {object} cdpClient - useCdpClient instance
 */
export function useNetworkMonitor(cdpClient) {
    const requests = ref([]);
    const filterType = ref('all');
    const searchText = ref('');
    const paused = ref(false);

    const requestMap = new Map(); // requestId -> index in requests array
    let setupDone = false;
    let unsubs = [];

    const TYPE_MAP = {
        xhr: ['XHR', 'Fetch'],
        js: ['Script'],
        css: ['Stylesheet'],
        img: ['Image'],
        font: ['Font'],
        doc: ['Document'],
        ws: ['WebSocket'],
        other: ['Other', 'Manifest', 'Preflight']
    };

    function matchTypeFilter(reqType, filter) {
        if (filter === 'all') return true;
        const group = TYPE_MAP[filter];
        return group ? group.includes(reqType) : true;
    }

    const filteredRequests = computed(() => {
        let list = requests.value;
        if (filterType.value !== 'all') {
            list = list.filter(r => matchTypeFilter(r.type, filterType.value));
        }
        if (searchText.value) {
            const q = searchText.value.toLowerCase();
            list = list.filter(r => r.url.toLowerCase().includes(q));
        }
        return list;
    });

    const stats = computed(() => {
        const all = requests.value;
        return {
            total: all.length,
            failed: all.filter(r => r.failed || (r.status && r.status >= 400)).length,
            pending: all.filter(r => !r.endTime && !r.failed).length,
            totalSize: all.reduce((sum, r) => sum + (r.size || 0), 0)
        };
    });

    function addRequest(data) {
        if (paused.value) return;
        const entry = {
            ...data,
            status: 0,
            statusText: '',
            mimeType: '',
            size: 0,
            duration: 0,
            endTime: null,
            failed: false,
            errorText: ''
        };
        if (requests.value.length >= MAX_REQUESTS) {
            const removed = requests.value.shift();
            requestMap.delete(removed.requestId);
            // Rebuild indices
            requestMap.clear();
            requests.value.forEach((r, i) => requestMap.set(r.requestId, i));
        }
        requestMap.set(data.requestId, requests.value.length);
        requests.value.push(entry);
    }

    function updateRequest(requestId, updates) {
        const idx = requestMap.get(requestId);
        if (idx == null || idx >= requests.value.length) return;
        const entry = requests.value[idx];
        Object.assign(entry, updates);
    }

    function setup() {
        if (setupDone) return;
        setupDone = true;
        unsubs.push(cdpClient.onEvent('Network.requestWillBeSent', (params) => {
            const data = normalizeRequestWillBeSent(params);
            // 捕获 POST/PUT 请求体
            if (params.request?.postData) {
                data.requestBody = params.request.postData;
            }
            addRequest(data);
        }));

        unsubs.push(cdpClient.onEvent('Network.responseReceived', (params) => {
            const data = normalizeResponseReceived(params);
            updateRequest(data.requestId, {
                status: data.status,
                statusText: data.statusText,
                mimeType: data.mimeType,
                responseHeaders: data.responseHeaders,
                remoteIPAddress: data.remoteIPAddress,
                protocol: data.protocol,
                size: data.encodedDataLength
            });
        }));

        unsubs.push(cdpClient.onEvent('Network.loadingFinished', (params) => {
            const data = normalizeLoadingFinished(params);
            const idx = requestMap.get(data.requestId);
            if (idx != null && idx < requests.value.length) {
                const entry = requests.value[idx];
                entry.endTime = data.endTime;
                entry.size = data.encodedDataLength || entry.size;
                entry.duration = entry.startTime ? Math.round((data.endTime - entry.startTime) * 1000) : 0;
            }
        }));

        unsubs.push(cdpClient.onEvent('Network.loadingFailed', (params) => {
            const data = normalizeLoadingFailed(params);
            const idx = requestMap.get(data.requestId);
            if (idx != null && idx < requests.value.length) {
                const entry = requests.value[idx];
                entry.endTime = data.endTime;
                entry.failed = true;
                entry.errorText = data.errorText;
                entry.blockedReason = data.blockedReason;
                entry.duration = entry.startTime ? Math.round((data.endTime - entry.startTime) * 1000) : 0;
            }
        }));
    }

    function dispose() {
        unsubs.forEach(unsub => unsub());
        unsubs = [];
        setupDone = false;
        clear();
    }

    function clear() {
        requests.value = [];
        requestMap.clear();
    }

    function togglePause() {
        paused.value = !paused.value;
    }

    /**
     * 获取响应体内容（懒加载）
     */
    async function fetchResponseBody(requestId) {
        try {
            const result = await cdpClient.send('Network.getResponseBody', { requestId });
            if (result.base64Encoded) {
                return { type: 'binary', size: result.body?.length || 0, hint: '二进制数据，无法展示' };
            }
            try {
                return { type: 'json', body: JSON.parse(result.body), raw: result.body };
            } catch {
                return { type: 'text', body: result.body };
            }
        } catch (e) {
            return { type: 'error', hint: `获取失败: ${e.message}` };
        }
    }

    return {
        requests,
        filteredRequests,
        filterType,
        searchText,
        paused,
        stats,
        setup,
        clear,
        togglePause,
        fetchResponseBody,
        dispose
    };
}
