# Local Inspect

Local Inspect is a private Android WebView diagnostic tool for offline or intranet environments. It discovers debuggable Android WebViews through ADB, opens a local debugging workbench, embeds the bundled Chrome DevTools frontend, and collects front-end error evidence directly from the target page.

## What it helps locate

- JavaScript runtime exceptions and console errors.
- Vue errors and Vue warning signals when available.
- Failed API requests, failed `fetch`/`XMLHttpRequest`, and static resource failures.
- Route changes, clicks, console messages, network failures, and other lightweight breadcrumbs before an error.
- Android bridge availability, including `window.android` and common methods.
- Blank-screen symptoms after page load.
- Sourcemap availability and source location confidence.
- Business context for the three known projects:
  - `zhbf-fontend`
  - `zhbf-bedhead-frontend`
  - `yarward-ntv-frontend`
- Filtered `adb logcat` lines related to WebView, Chromium, app logs, MQTT, mattress data, and front-end errors.

## Usage

1. Connect an Android device by USB.
2. Enable Developer Options and USB debugging.
3. Start the tool:

```powershell
npm start
```

4. Select a WebView target and click `调试工作台`.
5. Use the left-side categories to triage `接口报错`, `JS 报错`, `Vue 报错`, `资源失败`, `Bridge/上下文`, `时间线`, and `logcat`.
6. Use `复制 Markdown` or `复制 JSON` to share the diagnostic report.
7. Open `独立 DevTools` only when deeper manual inspection is needed.

## Diagnostic data

The diagnostic report includes:

- Device model, Android version, target page URL and route hash.
- Runtime exceptions, log entries, console errors and network failures from Chrome DevTools Protocol.
- Lightweight breadcrumbs collected through a temporary CDP-injected probe, including route changes, clicks, console warnings/errors, failed `fetch`/`XMLHttpRequest`, JS errors and Vue error handler events when available.
- Source hints from stack frames, including `webpack://` and chunk file locations when available.
- Sourcemap diagnostics: `sourceMappingURL` presence, map accessibility, `sourcesContent` availability, or clear fallback reasons.
- Page snapshot: `document.readyState`, DOM count, Vue root presence, key globals, selected storage fields, Android bridge methods.
- Filtered `logcat` output.

Sensitive fields are redacted before display or export when they look like tokens, passwords, client secrets, authorization headers, or bearer credentials. Business routing parameters such as `orgId`, `deptId`, and `devId` are kept for diagnosis.

## Project structure

- `main.js`: Electron entrypoint.
- `server.js`: Express server, ADB discovery, WebSocket proxy, logcat endpoint.
- `public/`: Local Inspect dashboard and debugging workbench.
- `devtools/`: Bundled offline Chrome DevTools frontend.
- `bin/`: Bundled ADB executable and Windows DLLs.

## Notes

- The tool does not modify inspected business projects.
- CDP diagnostics inject a temporary in-memory probe into the selected WebView page. It disappears with the page session and is not written to the business project.
- Some old WebView versions may not support multiple DevTools clients well. If the workbench cannot collect data while DevTools is open, close the DevTools pane and click `重新采集`.
- If no WebView target appears, confirm the Android app enables `WebView.setWebContentsDebuggingEnabled(true)`.
# zdevtools
