# Local Inspect

Local Inspect 是一款专为离线或局域网环境设计的私有 Android WebView 诊断工具。它能够通过 ADB 自动发现可调试的 Android WebView，开启本地调试工作台，嵌入内置的 Chrome DevTools 前端，并直接从目标页面收集前端错误凭证。

## 能够帮助定位的问题

- JavaScript 运行时异常与控制台错误。
- Vue 运行时的错误以及 Vue 警告信号（若可用）。
- 失败的 API 请求、失败的 `fetch` / `XMLHttpRequest` 以及静态资源加载失败。
- 出错前的轻量级面包屑记录，包括路由切换、点击事件、控制台消息、网络失败等。
- Android Bridge 可用性，包括 `window.android` 及其常用方法。
- 页面加载后的白屏症状。
- Sourcemap 可用性以及源码位置可信度。
- 与 WebView、Chromium、应用日志、MQTT、床垫数据及前端错误相关的已过滤 `adb logcat` 日志行。

## 使用方法

1. 通过 USB 连接 Android 设备。
2. 开启开发者选项和 USB 调试。
3. 启动工具：

```powershell
npm start
```

4. 选择一个 WebView 目标，然后点击“调试工作台”。
5. 使用左侧的分类对“接口报错”、“JS 报错”、“Vue 报错”、“资源失败”、“Bridge/上下文”、“时间线”和“logcat”进行排查与分类。
6. 使用“复制 Markdown”或“复制 JSON”来分享诊断报告。
7. 仅在需要更深入的手动排查时，才打开“独立 DevTools”。

## 诊断数据

诊断报告包括：

- 设备型号、Android 版本、目标页面 URL 以及路由哈希。
- 来自 Chrome DevTools Protocol (CDP) 的运行时异常、日志条目、控制台错误和网络请求失败。
- 通过临时注入页面的 CDP 探针收集的轻量级面包屑记录，包括路由切换、点击、控制台警告/错误、失败的 `fetch` / `XMLHttpRequest`、JS 错误和 Vue 错误处理程序事件（若可用）。
- 来自堆栈信息的源码提示，包括 `webpack://` 和分片（chunk）文件位置（若可用）。
- Sourcemap 诊断信息：`sourceMappingURL` 是否存在、Map 文件是否可访问、`sourcesContent` 是否可用，或明确的失败回退原因。
- 页面快照：`document.readyState`、DOM 节点数、Vue 根节点是否存在、关键全局变量、选定的本地存储（storage）字段、Android Bridge 方法。
- 过滤后的 `logcat` 输出。

在展示或导出前，所有看起来像 token、密码、客户端密钥（client secret）、授权标头（authorization header）或 Bearer 凭证的敏感字段都会被脱敏。而像 `orgId`、`deptId` 和 `devId` 等用于诊断的业务路由参数将被保留。

## 项目结构

- `main.js`：Electron 入口文件。
- `server.js`：Express 服务器，处理 ADB 发现、WebSocket 代理和 logcat 接口。
- `public/`：Local Inspect 控制面板和调试工作台前端。
- `devtools/`：打包的离线 Chrome DevTools 前端。
- `bin/`：打包的 ADB 可执行文件和 Windows DLL。

## 注意事项

- 本工具不会修改被诊断的业务项目。
- CDP 诊断通过向选定的 WebView 页面注入临时的内存探针来进行。它会随着页面会话结束而消失，不会写入业务项目。
- 某些老旧的 WebView 版本可能无法很好地支持多个 DevTools 客户端。如果打开 DevTools 窗口后工作台无法收集数据，请关闭 DevTools 面板并点击“重新采集”。
- 如果没有显示 WebView 目标，请确认 Android 应用中已启用 `WebView.setWebContentsDebuggingEnabled(true)`。

# zdevtools

