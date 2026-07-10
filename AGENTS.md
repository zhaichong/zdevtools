# AGENTS.md

## 命令

- 完整开发（Vite + Electron 同时运行）：先 `npm run build`（或设置 `VITE_DEV=true`），再 `npm start`。单独 `npm start` 加载的是已构建的 `dist/`，而不是 Vite 开发服务器。
- 仅前端预览：`npm run dev`（Vite 端口 5173）。Electron 窗口只有在启动 `npm start` 的环境中设置了 `VITE_DEV=true` 时才会使用它。
- 构建：`npm run build`（`vite build`）→ 产物在 `dist/`，由打包后的 app 加载。
- 测试：`npm test` 执行 `node tests/diagnostic-run.test.mjs` —— 纯 Node 脚本，无测试框架。**没有配置 lint 或 typecheck**；改动 JS 后通过运行此脚本和实际启动 Electron 应用来验证。
- 打包：`npm run pack`（解包版）/ `npm run dist`（NSIS 安装包 → `release-build/`）。
- 发布：`npm run release` 是交互式流程（版本号 → git tag → push → `electron-builder` → GitHub release）。仅在明确要求时执行；它会发布自动更新。

## 架构

Electron 应用（Windows NSIS 目标）。三层运行时，跑在一个进程里：

- **主进程**（`main.js` + `preload.js`）：启动 Express 服务，注册 IPC，打开 dashboard/workbench 窗口。`preload.js` 通过 `contextBridge` 暴露密封的 `electronAPI` —— 新增 renderer↔main 调用要在这里加，并在 `main.js`（或 `src/main/ipc/` 下的解耦 handler）里加对应的 `ipcMain.handle`。
- **本地服务**（`src/server/index.js`）：Express 托管 `dist/` + 内置 `devtools/`，外加 WebSocket 代理（`proxy.js`），把 `/ws-proxy/<port>/devtools/page/<targetId>` 转发到 ADB/HDC 映射的 CDP 端口。只有 forward 范围内的端口会被代理（`isAllowedProxyTarget`）。
- **前端**（`src/pages/`）：两个入口页 —— `dashboard`（设备发现 → 为每个 target 打开 `workbench.html`）和 `workbench`（诊断 UI，由 `src/pages/workbench/composables/` 下的 composables 驱动）。由 Vite 构建到 `dist/`。

设备发现是**双驱动**系统：`src/server/drivers/adbDriver.js`（Android）和 `hdcDriver.js`（HarmonyOS）共享 `baseDriver.js`。一个 `driverType`（'adb'|'hdc'）从前端经 IPC 传进 `deviceManager`。不要假设只有 ADB。

CDP 取证流程：`useWorkbenchSession` 通过 WS 代理连接 CDP 客户端，往目标页注入临时内存探针（`useProbe`），通过 `Runtime.addBinding` 录制 rrweb，生成根因报告（`useRootCauses`）+ 持久化诊断会话（`src/main/ipc/diagnostic.js`，存储在 `userData/diagnostics/`）。

## 关键目录

- `devtools/` —— 内置离线 Chrome DevTools 前端。深度排查复用它；产品工具页**不得**重复 DevTools 已有功能（见设计标准）。
- `bin/` —— 内置 `adb.exe`/`hdc.exe` + Windows DLL，作为 `extraResources` 打包。驱动从 `bin/`（开发）或 `process.resourcesPath/bin`（打包后）解析二进制路径。
- `src/shared/` —— 两个页面共用的工具（CDP 客户端、项目识别、快照、脱敏、堆栈解析）。

## 约定与坑

- CDP 探针**仅临时存在于内存** —— 不要把注入脚本或 rrweb 数据写进被诊断的业务项目。rrweb 分片持久化到 `userData/rrweb/`，不是仓库。
- 敏感字段（token、密码、auth header）在展示/导出前脱敏（`src/shared/utils/redact.js`、探针内 `redact`）。新增任何取证路径都要保留脱敏。
- 注释和 UI 文案中英混用；跟随所在文件的语言风格。
- Electron `web-contents-created` 会从 userAgent 里去掉 `Electron/`；DevTools 和 target 检测可能依赖这一点。
- 应用以 `asar: true` 打包；`main.js`、`preload.js`、`src/main/**`、`src/server/**`、`dist/**`、`devtools/**` 会被打包（见 `package.json` 的 `build.files`）。主进程/服务代码需要的新内容必须能被这些 glob 命中。

## 设计标准

- UI 改动优先面向打包后的 Electron 应用设计，而不是 Vite 网页预览。在实现可见的重新设计前，当用户提出要求时提供一个可确认的设计稿。产品工具页应只展示关键任务信息，使用干净对齐的面板、清晰的状态、可见的控件，并在视觉效果打磨的同时修复可用性/功能 bug。不要重复 app 已内置的 Chrome DevTools 功能。