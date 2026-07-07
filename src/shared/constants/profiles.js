export const PROFILES = [
    {
        id: 'yarward-ntv-frontend',
        name: 'NurseNtv (病房床头/门口机)',
        bridgeMethods: ['MySDK', 'getDeviceInfo', 'getOrgId', 'getAccessToken', 'launchFinished'],
        guidance: {
            title: '按 NurseNtv 启动链路复核',
            description: '当前识别为 yarward-ntv 页面。',
            action: '依次确认 URL orgId/deptId/devId、globalConfig、MATTRESS_API_CONFIG、MySDK、MQTT 日志。'
        },
        bridgeAction: '确认 MySDK、getDeviceInfo、getOrgId、getAccessToken 和 launchFinished 调用时机。'
    },
    {
        id: 'zhbf-bedhead-frontend',
        name: '床头卡前端',
        bridgeMethods: ['writeLog', 'getDeviceInfo', 'getOrgId', 'getAccessToken'],
        guidance: {
            title: '按床头卡链路复核',
            description: '当前识别为床头卡页面。',
            action: '打开 webDebug 后复现，重点看 writeLog/logcat、床头卡接口和 IdlePerformance。'
        },
        bridgeAction: '确认 writeLog、getDeviceInfo、getOrgId、getAccessToken 是否由 Android 注入。'
    },
    {
        id: 'zhbf-fontend',
        name: '信息看板前端',
        bridgeMethods: ['pageLoadFinished', 'toLogInE'],
        guidance: {
            title: '按信息看板链路复核',
            description: '当前识别为 zhbf-fontend。',
            action: '先查 ApiBase 请求和 token/orgId，再确认 pageLoadFinished/toLogInE。'
        },
        bridgeAction: '确认 pageLoadFinished、toLogInE 和 token/orgId 获取方法是否存在。'
    }
];

export function getProfileConfig(profileId) {
    return PROFILES.find(p => p.id === profileId) || null;
}

export function getBridgeAction(missingMethods, profileId) {
    const config = getProfileConfig(profileId);
    if (config && config.bridgeAction) {
        return config.bridgeAction;
    }
    return `确认 Android 注入的方法是否和前端调用一致：${missingMethods.join(', ')}。`;
}
