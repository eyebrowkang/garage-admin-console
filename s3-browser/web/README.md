# @s3-browser/web

S3 Browser frontend SPA — runs standalone AND is the **Module Federation Remote** consumed by `@garage-admin/web`.

**Tech stack**: React 19, TypeScript, Rsbuild, TanStack Query, `@garage/ui` + `@garage/tokens`, `@module-federation/rsbuild-plugin`, `@module-federation/bridge-react`.

## Roles

- **Standalone product** — log in, manage S3 connections, browse buckets and objects against any S3-compatible endpoint. Runs as a normal SPA.
- **Module Federation Remote** — exposes `./FileBrowser` (the primary surface) and `./export-app` (full app via Bridge). Embedded by `@garage-admin/web`'s BucketDetail page.

## Development

```bash
pnpm -C s3-browser/web dev          # http://localhost:5174
pnpm -C s3-browser/web build        # production build + MF manifest
```

The dev server proxies `/api/*` to `http://localhost:3002` (the S3 Browser BFF).

When the dev server is running, the MF manifest is published at `/mf-manifest.json` and the remote entry at `/remoteEntry.js` on whichever host you use to access port `5174`. The Admin Console (`@garage-admin/web`) picks these up automatically via `VITE_S3_BROWSER_MF_URL`, or derives the same hostname in development when that variable is unset.

## Docker

The web build is shipped inside the single `ghcr.io/eyebrowkang/s3-browser:latest` product image. That image can run in two modes:

- default standalone mode: API + SPA + MF remote;
- `S3_BROWSER_STATIC_ONLY=true`: static SPA/MF remote only, for embedded Admin deployments.

```bash
docker build -f docker/s3-browser.Dockerfile -t s3-browser .
docker run -p 3002:3002 -e S3_BROWSER_STATIC_ONLY=true s3-browser
```

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

- Only React + ReactDOM are runtime-shared. `@garage/ui` / `@garage/tokens` are bundled (build-time deps), per `designs/mf-integration-plan.md` §2.6.
- `assetPrefix: 'auto'` keeps dev and production MF assets resolved from the remote origin, so cross-origin Admin embeds do not leak asset requests back to the Admin host.
- `dts` is enabled for `rsbuild build` only. Production builds emit remote types so hosts can consume `FileBrowserProps` from `@mf-types/`, while dev avoids the local DTS broker WebSocket. The Admin Console keeps a hand-rolled shim at [`garage-admin-console/web/src/types/s3-browser.d.ts`](../../garage-admin-console/web/src/types/s3-browser.d.ts) as a fallback.
- `enableBridgeRouter: false` — `./FileBrowser` doesn't use react-router; the host owns navigation.

## The federated `FileBrowser` component

[`src/features/file-browser/FileBrowser.tsx`](src/features/file-browser/FileBrowser.tsx). Hard rules (per the architectural contract):

- Must NOT import `@aws-sdk/*`. All S3 details live in the BFF.
- Must NOT use `react-router-dom`. Path state is parent-controlled (`path: string[]` + `onPathChange`).
- Must NOT read auth tokens from `localStorage`, `window`, or env vars. Only `props.backend.{baseUrl, authToken}`.
- Owns its own embedded `QueryClient` so it stays self-contained.

```ts
export interface FileBrowserProps {
  backend: { baseUrl: string; authToken: string }; // baseUrl already encodes the bucket
  bucket: string;
  path: string[];
  onPathChange: (path: string[]) => void;
  viewMode?: 'list' | 'details' | 'grid';
  onViewModeChange?: (m: 'list' | 'details' | 'grid') => void;
  density?: 'compact' | 'comfortable';
  showPreview?: boolean;
  onSelect?: (items: S3Object[]) => void;
  onError?: (err: Error) => void;
}
```

## Standalone shell

State-based navigation (no router):

- `home` ([`features/home/HomePage.tsx`](src/features/home/HomePage.tsx)) — Connection Dashboard with fleet summary + connection cards + add/edit/delete
- `connection` ([`features/connection/ConnectionView.tsx`](src/features/connection/ConnectionView.tsx)) — bucket grid for one connection
- `bucket` ([`features/bucket/BucketView.tsx`](src/features/bucket/BucketView.tsx)) — wraps `FileBrowser` with a breadcrumb header

The shell consumes the same `@garage/ui` + `@garage/tokens` palette as the Admin Console, so embedded and standalone modes are visually identical.

## Documentation

- [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md) — full developer guide
- [`../../designs/mf-integration-plan.md`](../../designs/mf-integration-plan.md) — frozen architectural contract
