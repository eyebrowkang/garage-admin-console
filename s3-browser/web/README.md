# @s3-browser/web

S3 Browser frontend SPA — runs standalone AND is the **Module Federation Remote** consumed by `@garage-admin/web`.

**Tech stack:** React 19, TypeScript, Rsbuild, TanStack Query, `@garage/ui` + `@garage/tokens` + `@garage/web-shared`, `@module-federation/rsbuild-plugin`, `@module-federation/bridge-react`.

## Roles

- **Standalone product** — log in, manage S3 connections, browse buckets/objects against any S3-compatible endpoint.
- **MF Remote** — exposes `./FileBrowser` (the primary surface) and `./export-app` (the full app via Bridge). Embedded by the Admin Console's BucketDetail page.

Local dev + the embedded-FileBrowser workflow → [docs/development.md](../../docs/development.md).
Docker → [docs/deployment.md](../../docs/deployment.md).
Standalone routing + how the host consumes the remote → [docs/architecture.md](../../docs/architecture.md#s3-browser-web).

## MF Remote configuration

[`rsbuild.config.ts`](rsbuild.config.ts):

```ts
pluginModuleFederation({
  name: 's3Browser',
  filename: 'remoteEntry.js',
  exposes: {
    './export-app': './src/export-app.tsx',
    './FileBrowser': './src/export-file-browser.tsx',
  },
  shared: {
    react: { singleton: true, requiredVersion: '^19' },
    'react-dom': { singleton: true, requiredVersion: '^19' },
  },
  dts: command === 'build',
  bridge: { enableBridgeRouter: false },
});
```

- Only React + ReactDOM are runtime-shared; `@garage/ui` / `@garage/tokens` are bundled into the remote so the host can ship its own design-token version without coordinating a redeploy.
- **Asset prefix:** the production build uses `output.assetPrefix: 'auto'`; the **dev** server pins `dev.assetPrefix` to its own origin (`S3_BROWSER_DEV_ORIGIN ?? 'http://localhost:5174'`) so a cross-origin host loads `remoteEntry.js`'s chunks from `:5174`, not the host's `:5173`.
- `dts` is enabled for `rsbuild build` only — production emits remote types so hosts can consume `FileBrowserProps` from `@mf-types/`; dev avoids the local DTS broker WebSocket. The Admin Console keeps a hand-rolled shim at [`garage-admin-console/web/src/types/s3-browser.d.ts`](../../garage-admin-console/web/src/types/s3-browser.d.ts) as a fallback.
- `enableBridgeRouter: false` — `./FileBrowser` doesn't use react-router; the host owns navigation.

## The federated `FileBrowser` component

[`src/file-browser/FileBrowser.tsx`](src/file-browser/FileBrowser.tsx) is the public contract of the remote. Conventions that keep it embeddable: no `@aws-sdk/*` imports (S3 lives in the BFF); no `react-router-dom` (path state is parent-controlled); credentials only from `props.backend`; it owns its own `QueryClient`.

```ts
export type FileBrowserViewMode = 'list' | 'grid';

export interface FileBrowserProps {
  backend: {
    baseUrl: string; // already encodes the bucket
    authToken: string;
    headers?: Record<string, string>; // forwarded on every request (e.g. X-Garage-Access-Key-Id)
  };
  bucket: string;
  path: string[];
  onPathChange: (path: string[]) => void;
  viewMode?: FileBrowserViewMode;
  onViewModeChange?: (m: FileBrowserViewMode) => void;
  density?: 'compact' | 'comfortable';
  showPreview?: boolean;
  onSelect?: (items: unknown[]) => void;
  onError?: (err: Error) => void;
}
```
