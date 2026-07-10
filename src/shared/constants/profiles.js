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
        bridgeAction: '确认 MySDK、getDeviceInfo、getOrgId、getAccessToken 和 launchFinished 调用时机。',
        storageKeys: ['webDebug','orgInfo','deptInfo','deviceInfo','patientInfo','loginInfo','IdlePerformance','httpException','nowRouter','diagnose','accessToken','token'],
        globalFlags: ['android','websdk','zhbfbed','zhctbed','globalConfig','MATTRESS_API_CONFIG','MySDK'],
        globalMethodRules: [
            { pattern: /ROLL_DEPT|HANDWRITING|MATTRESS/i, owner: '前端初始化 / Android Bridge / 床垫模块', reason: '床垫或手写板等扩展模块调用。', next: '1. 检查 launchFinished 前是否提前收到 MQTT / 扩展设备数据；2. 确认相关模块 bundle 已经加载。' },
            { pattern: /SDK|COMMAND|BRIDGE/i, owner: 'Android Bridge / 容器注入', reason: '容器调用。', next: '1. 检查容器方法注入时机。' }
        ],
        triggerHints: ['_onMattressDataReceived', 'onMattressDataReceived', 'launchFinished', 'HANDWRITINGCOMMAND', 'ROLL_DEPT']
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
        bridgeAction: '确认 writeLog、getDeviceInfo、getOrgId、getAccessToken 是否由 Android 注入。',
        storageKeys: ['webDebug','orgInfo','deptInfo','deviceInfo'],
        globalFlags: ['android', 'zhbfbed', 'globalConfig', 'log'],
        globalMethodRules: [],
        triggerHints: ['writeLog']
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
        bridgeAction: '确认 pageLoadFinished、toLogInE 和 token/orgId 获取方法是否存在。',
        storageKeys: ['webDebug','orgInfo','accessToken','token'],
        globalFlags: ['android', 'globalConfig', 'log'],
        globalMethodRules: [],
        triggerHints: ['pageLoadFinished', 'toLogInE']
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
