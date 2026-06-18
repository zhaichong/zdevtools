/**
 * 从 URL、快照和事件中识别所属前端项目
 * @param {string} url
 * @param {object} [snapshot={}]
 * @param {Array} [events=[]]
 * @returns {{ id: string, label: string, tags?: string[] }}
 */
export function identifyProject(url, snapshot = {}, events = []) {
    const text = [
        url,
        snapshot.href,
        snapshot.title,
        JSON.stringify(snapshot.globals || {}),
        events.map(event => event.text || event.message || event.url || '').join(' ')
    ].join(' ');

    if (snapshot.globals?.globalConfig || snapshot.globals?.mattressConfig || snapshot.globals?.mySdk
        || /\/ntv\/|NurseNtv|MATTRESS|mattress|mqtt|launchFinished|globalConfig|MySDK/i.test(text)) {
        return { id: 'yarward-ntv-frontend', label: 'yarward-ntv', tags: ['护理大屏', 'MQTT', '床垫'] };
    }
    if (snapshot.storage?.local?.webDebug !== undefined || snapshot.globals?.zhctbed
        || /zhct|bedhead|webDebug|BedHead|writeLog|IdlePerformance/i.test(text)) {
        return { id: 'zhbf-bedhead-frontend', label: 'zhbf-bedhead', tags: ['床头卡', 'webDebug', 'Performance'] };
    }
    if (snapshot.globals?.zhbfbed
        || /zhbf|bedside|diagnose=1|toLogInE|ApiBase|pageLoadFinished/i.test(text)) {
        return { id: 'zhbf-fontend', label: 'zhbf-fontend', tags: ['信息看板', 'ApiBase', 'Android bridge'] };
    }
    return { id: 'unknown', label: '未识别', tags: [] };
}
