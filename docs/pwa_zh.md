# 渐进式 Web 应用（PWA）

[English](./pwa.md) | [中文](./pwa_zh.md)

两个 Web 应用——**Admin Console**（Vite host）和 **S3 Browser**（Rsbuild remote）——都以可安装 PWA 形式发布：Web App Manifest、Service Worker、maskable 图标。安装后各自以独立应用运行（主屏图标、全屏、app-shell 离线兜底），同时仍是单代码库、单部署。

## 各应用包含的内容

| 部分 | Admin Console | S3 Browser |
| --- | --- | --- |
| Manifest | `web/public/manifest.webmanifest` | `web/public/manifest.webmanifest` |
| Service Worker | `web/public/sw.js` | `web/public/sw.js` |
| 图标 | `web/public/pwa-{192,512}.png`、`pwa-maskable-512.png`、`apple-touch-icon-180.png` | 同名 |
| Manifest 链接 / meta | `web/index.html` | 经 `rsbuild.config.ts` 的 `html.tags` 注入 |
| SW 注册 | `web/src/main.tsx`（仅生产） | `web/src/main.tsx`（仅生产，**独立入口**） |

`theme_color` 为品牌橙 `#ff9429`，`background_color` 为 `#fffdfa`（`@garage/tokens` 的 background）。注册以 `import.meta.env.PROD` 为条件，避免开发服务器的 HMR 被缓存遮蔽。

## Service Worker 缓存契约

SW 严格复刻 BFF 的 `Cache-Control` 纪律。这是**承重不变量**：陈旧的 SW 绝不能把版本错位的 Module Federation 远端喂给 host 的 React 单例，否则会复现 React 19 两副本的 “Invalid hook call”。

| 请求 | 策略 |
| --- | --- |
| `/api/*` | 仅网络（绝不缓存鉴权 / 数据） |
| `/runtime-config.js`（Admin） | 仅网络（运行时环境注入） |
| `**/remoteEntry.js`、`**/mf-manifest.json` | 仅网络（MF 入口必须与 host 匹配） |
| `/assets/*`（Admin）、`/static/*`（S3）、`/s3-browser/static/*` | 缓存优先（内容哈希、不可变） |
| 导航请求 | 网络优先 → 离线时回退到缓存的 app shell |
| 其他同源 GET | stale-while-revalidate |

要点：

- SW **绝不预缓存** `index.html` / `remoteEntry.js` / `mf-manifest.json`。导航走网络优先，因此在线用户始终拿到最新的 shell 与远端；缓存的 shell 仅作离线兜底。
- 不调用 `skipWaiting()` / `clients.claim()`——新 SW 仅在所有标签页关闭后接管，活动页面的资源不会被中途替换。
- Admin 的 SW（作用域 `/`）也会拦截内嵌 S3 Browser 在 `/s3-browser/` 下的请求；其中 MF 入口文件走仅网络，哈希化的 `/s3-browser/static/*` chunk 走缓存优先。
- S3 Browser 仅从其**独立入口**（`src/main.tsx`）注册 SW，绝不从 MF 暴露的模块注册，因此把 FileBrowser 内嵌进 Admin host 时不会重复注册。

修改任一 `sw.js` 中的 `CACHE_VERSION` 即可强制干净地滚动缓存。

## 服务端要求

BFF 以 `Cache-Control: no-store` 提供 `sw.js` 和 `manifest.webmanifest`（manifest 还设 `Content-Type: application/manifest+json`），使 SW / manifest 更新在下次加载即生效——见各应用的 `api/src/index.ts`。哈希资源仍为 `immutable`。无需其他服务端改动；PWA 复用既有的 JWT-bearer 鉴权与同源代理，保持不变。

## 会话持久化

安装后的应用依赖透明 JWT 刷新流程（短时 access token + 长时 refresh token），以免用户每天被踢回 `/login`。详见 [architecture.md](./architecture.md) 的鉴权说明。部署该刷新改动会触发一次**一次性重新登录**，因为旧的无 `type` 令牌会被拒绝。

## 重新生成图标

母版是各应用的 1024×1024 透明 `web/source/<app>-logo.svg`，提交的图标都由它渲染而来。每个应用的规范集为：公开的 `*-logo.svg`（source 的副本——既作 UI logo 也作 SVG favicon）、`favicon.ico`（不透明，16/32/48）、`apple-touch-icon-180.png`、`pwa-192.png` / `pwa-512.png`（purpose `any`）、`pwa-maskable-512.png`（purpose `maskable`）。

更换 logo 后如需重新生成：将 source 渲染到不透明 `#fffdfa` 方形背景上（品牌 logo 含深色元素，透明栅格在深色表面会消失）——方形图标 logo 占比 `~0.82`，maskable 安全区占比 `~0.62`——例如用 `sharp`（`.ico` 用 `png-to-ico`），再覆盖 `web/public/`。

## 验证

1. 构建（`pnpm build` + `pnpm -C s3-browser/web build`），并通过 BFF（或任意静态服务器，经 `http://localhost` / HTTPS——SW 需要安全上下文）伺服 `dist`。
2. Chrome DevTools → Application：确认 manifest 解析正常、SW 处于 **activated**、出现安装入口；运行 Lighthouse PWA 审计。
3. 真机：Android Chrome 会弹出安装提示；iOS Safari 经「分享 → 添加到主屏幕」安装。确认全屏启动、状态栏颜色、安全区内边距与主屏图标。（iOS 行为只能在真机上验证。）
