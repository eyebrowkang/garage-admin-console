# Module Federation Guide

The Admin Console is the MF host. S3 Browser provides the MF remote.

This integration is deliberately split across two layers:

- the **frontend** loads S3 Browser UI from `remoteEntry.js`;
- the **backend** proxies embedded API traffic through `/s3-api/*`.

Those two layers are configured differently and should not be conflated.

## Remote Contract

The S3 Browser remote exposes:

| Export | Description |
|--------|-------------|
| `./ObjectBrowser` | Single-bucket object browser |
| `./BucketExplorer` | Bucket list plus object drill-down |
| `./S3EmbedProvider` | Context provider for embedded API config |

Shared singletons:

- `react`
- `react-dom`
- `react-router-dom`
- `@tanstack/react-query`

## Default Remote Entry Path

Admin resolves the remote entry through `apps/admin/web/src/lib/mf-config.ts`.

Default:

```ts
/s3-browser/remoteEntry.js
```

That default is correct for:

- local development, because Admin's Vite dev server proxies `/s3-browser/*` to the remote dev
  server;
- the combined image, because Admin serves the embedded remote assets itself.

## External Remote Override

When Admin is deployed separately from S3 Browser, override the remote entry at build time:

```bash
docker build \
  --build-arg VITE_S3_BROWSER_REMOTE_ENTRY=https://s3-browser.example.com/remoteEntry.js \
  -t garage-admin \
  -f docker/admin.Dockerfile .
```

This setting is build-time only. Changing it requires rebuilding the Admin web bundle.

## Embedded API Contract

MF only loads UI code. Embedded S3 operations still need API access.

Inside Admin, embedded S3 components should talk to:

```ts
apiBase: '/s3-api'
```

That same-origin contract lets Admin proxy requests to the configured S3 Browser API base and
avoid browser CORS problems.

### Proxy Mapping

Admin API route:

```text
/s3-api/* -> ${S3_BROWSER_API_URL}/*
```

Examples:

| Browser Request | Upstream Request |
|-----------------|------------------|
| `GET /s3-api/api/health` | `GET ${S3_BROWSER_API_URL}/api/health` |
| `GET /s3-api/connections` | `GET ${S3_BROWSER_API_URL}/connections` |
| `GET /s3-api/s3/<id>/objects?...` | `GET ${S3_BROWSER_API_URL}/s3/<id>/objects?...` |

`S3_BROWSER_API_URL` must be the S3 Browser **base URL**, not an `/api`-prefixed path.

## S3EmbedProvider Config

```ts
interface S3EmbedConfig {
  apiBase: string;
  connectionId: string;
  bucket?: string;
  readonly?: boolean;
  token?: string;
}
```

Admin's built-in bucket-detail integration creates or reuses an S3 Browser connection through
`POST /api/s3-bridge/:clusterId/connect`, then mounts the remote with:

- `apiBase: '/s3-api'`
- `connectionId: <bridge-created connection id>`
- `token: <S3 Browser JWT>`
- `bucket: <resolved bucket alias>`
- `readonly: true | false`

## Development Topology

Recommended:

```bash
pnpm dev
```

This starts:

- Admin API on `3001`
- Admin web on `5173`
- S3 Browser API on `3002`
- S3 Browser web on `5174`

Admin's Vite server keeps the integration same-origin during development:

| Dev Path | Target |
|----------|--------|
| `/api/*` | `http://localhost:3001` |
| `/s3-browser/*` | `http://localhost:5174` |
| `/s3-api/*` | `http://localhost:3002/api/*` |

That means the Admin frontend still loads the remote from `/s3-browser/remoteEntry.js` during
development.

## Combined Runtime Boundary

In the combined Docker image:

- Admin serves the shell at `/`
- Admin serves MF assets at `/s3-browser/remoteEntry.js` and `/s3-browser/assets/*`
- Admin proxies S3 Browser API traffic at `/s3-api/*`
- the standalone S3 Browser SPA is intentionally hidden

Expected combined behavior:

| Request | Result |
|---------|--------|
| `GET /s3-browser/remoteEntry.js` | `200 OK` |
| `GET /s3-browser/assets/...` | `200 OK` |
| `GET /s3-browser/` | `404 Not Found` |
| `GET /s3-browser/connections` | `404 Not Found` |

This boundary is important: combined mode embeds S3 Browser as capability, not as a second shell.

## Side-by-Side Deployment Checklist

If you deploy Admin and S3 Browser independently:

1. Build Admin with `VITE_S3_BROWSER_REMOTE_ENTRY=https://<s3-host>/remoteEntry.js`
2. Run S3 Browser so `https://<s3-host>/remoteEntry.js` is reachable
3. Set Admin API runtime `S3_BROWSER_API_URL=https://<s3-host>`
4. Set Admin API runtime `S3_BROWSER_ADMIN_PASSWORD` to the S3 Browser password if it differs
   from `ADMIN_PASSWORD`

MF remote loading and Admin API bridging are both required. Setting only one of them gives you a
half-wired integration.

## Example Host Usage

```tsx
import React, { Suspense } from 'react';

const RemoteS3EmbedProvider = React.lazy(() =>
  import('s3_browser/S3EmbedProvider').then((mod) => ({ default: mod.S3EmbedProvider })),
);

const RemoteObjectBrowser = React.lazy(() =>
  import('s3_browser/ObjectBrowser').then((mod) => ({ default: mod.ObjectBrowser })),
);

<Suspense fallback={<div>Loading S3 Browser...</div>}>
  <RemoteS3EmbedProvider
    config={{
      apiBase: '/s3-api',
      connectionId: 'connection-id',
      token: 's3-browser-jwt',
      bucket: 'photos',
      readonly: true,
    }}
  >
    <RemoteObjectBrowser bucket="photos" />
  </RemoteS3EmbedProvider>
</Suspense>;
```
