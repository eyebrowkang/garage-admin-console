# Architecture

The in-depth reference for how the monorepo fits together. For the contribution
process see [CONTRIBUTING.md](../CONTRIBUTING.md); for local setup and day-to-day
tasks see [development.md](./development.md).

## System design

The repo ships **two products that intentionally share a design system and a
Bucket Backend API contract**, plus a thin Module Federation glue so the S3
Browser's `FileBrowser` component can be embedded directly into the Admin
Console's bucket detail page.

```
┌──────────────────────────────────────────────────────────────┐
│                          Browser                              │
└─────────────────────────────┬────────────────────────────────┘
                              │ HTTP
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌──────────────────────┐                ┌──────────────────────┐
│ Admin Web (Vite)     │                │ S3 Browser Web       │
│  - MF Host           │   federated    │  (Rsbuild, MF Remote)│
│  - React Router v7   │ ◀──FileBrowser─│  exposes ./FileBrowser│
│  - @garage/ui        │                │  + ./export-app       │
└──────┬───────────────┘                └──────┬───────────────┘
       │ /api/*                                │ /api/*
       ▼                                       ▼
┌──────────────────────┐                ┌──────────────────────┐
│ Admin BFF (:3001)    │                │ S3 Browser BFF (:3002)│
│  - Express 5         │                │  - Express 5          │
│  - Drizzle + SQLite  │                │  - Drizzle + SQLite   │
│  - AES-256-GCM       │                │  - AES-256-GCM        │
│  - Garage proxy      │                │  - Per-connection S3  │
│  - Per-bucket S3 keys│                │    client             │
└──────┬───────────────┘                └──────┬───────────────┘
       │ admin API + S3 protocol               │ S3 protocol
       ▼                                       ▼
┌──────────────────────┐                ┌──────────────────────┐
│ Garage Cluster       │                │ Any S3-compatible    │
│  - Admin API v2      │                │ endpoint             │
│  - S3 endpoint       │                └──────────────────────┘
└──────────────────────┘
```

### Key design decisions

1. **BFF proxy pattern.** Frontends NEVER talk to Garage / S3 endpoints
   directly. Every request flows through a BFF that holds encrypted credentials
   and never returns them to the client.
2. **Two BFFs, one contract.** Both BFFs implement the same
   [Bucket Backend API](./bucket-api.md). The federated `FileBrowser` component
   is bound only to that contract, not to a particular BFF.
3. **Encrypted credentials.** Garage admin tokens (`Cluster.adminToken`) and S3
   keypairs (`Connection.{accessKeyId,secretAccessKey}`) are AES-256-GCM
   encrypted at rest via the shared [`@garage/crypto`](../packages/crypto/) helper.
4. **Host-selected S3 keys in embedded mode.** The Admin BFF does not create
   keys. The host UI picks an existing access key authorized on the bucket and
   forwards it as `X-Garage-Access-Key-Id`; the BFF resolves that key's secret
   on demand via Garage `GetKeyInfo`, caching it per `(clusterId, accessKeyId)`
   with a 10-minute TTL
   ([`src/lib/garage-keys.ts`](../garage-admin-console/api/src/lib/garage-keys.ts)).
   Restart just re-resolves from Garage.
5. **Single admin password per BFF.** Simple auth model; JWTs issued with 24h
   expiry. The two BFFs are independent auth realms by default (no shared JWT
   secret).
6. **Monorepo with shared packages.** `@garage/tokens` and `@garage/ui` are
   **build-time** workspace deps consumed by both web apps — not runtime MF
   singletons. Independent versioning, clean types, no runtime negotiation.

## Repository layout

```
garage-admin-console/                  # monorepo root
├── garage-admin-console/              # Admin Console product (production)
│   ├── api/                           # BFF — Express + Drizzle + SQLite (MF-agnostic)
│   └── web/                           # SPA — React + Vite — Module Federation Host
├── s3-browser/                        # S3 Browser product
│   ├── api/                           # BFF — same stack as Admin api
│   └── web/                           # SPA — React + Rsbuild — Module Federation Remote
├── packages/
│   ├── tokens/                        # @garage/tokens — CSS variables + palette
│   ├── ui/                            # @garage/ui — shadcn primitives, Toaster, LoginForm, cn
│   ├── web-shared/                    # @garage/web-shared — api-client/query-client factories, formatters, getApiErrorMessage
│   ├── crypto/                        # @garage/crypto — AES-256-GCM encrypt/decrypt (shared by both BFFs)
│   ├── server-config/                 # @garage/server-config — env loader, auth router, SQLite/migration helpers
│   ├── bucket-api-server/             # @garage/bucket-api-server — shared Express router for the Bucket Backend API
│   └── bucket-api-contract-tests/     # @garage/bucket-api-contract-tests — Bucket Backend API regression suite
├── docs/                              # this documentation
├── designs/                           # historical design notes (local-only, gitignored)
├── e2e/                               # Playwright tests for the Admin Console
├── screenshots/                       # rendered Admin Console screenshots
├── docker/                            # Dockerfiles, compose, build-context ignores
└── pnpm-workspace.yaml                # workspaces: garage-admin-console/*, s3-browser/*, packages/*
```

Each workspace has its own README with deeper, package-specific notes.

## Admin BFF

Routes (registered in [`src/app.ts`](../garage-admin-console/api/src/app.ts)):

| Endpoint | Method | Auth | Description |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | No | Authenticate and receive JWT |
| `/api/health` | GET | No | Health check |
| `/api/clusters` | GET / POST | JWT | List / add clusters (tokens excluded from list) |
| `/api/clusters/:id` | PUT / DELETE | JWT | Update / remove a cluster |
| `/api/proxy/:clusterId/*splat` | ALL | JWT | Pass-through to the Garage Admin API |
| `/api/clusters/:clusterId/buckets/:bucket/*` | various | JWT | [Bucket Backend API](./bucket-api.md) |

- The JSON body parser skips `multipart/form-data` so busboy can stream uploads.
- Bucket-API requests mint or reuse a cached per-(cluster, bucket) S3 keypair
  before signing the S3 call.

Database (`Cluster`, `AppSettings`) — see [Database schemas](#database-schemas).

Key files: [`src/lib/garage-keys.ts`](../garage-admin-console/api/src/lib/garage-keys.ts)
(per-bucket key minting + cache), [`src/lib/s3-client.ts`](../garage-admin-console/api/src/lib/s3-client.ts),
[`src/routes/buckets.ts`](../garage-admin-console/api/src/routes/buckets.ts),
[`src/encryption.ts`](../garage-admin-console/api/src/encryption.ts) (re-exports `@garage/crypto`).

## Admin Web

React Router v7 (in [`src/App.tsx`](../garage-admin-console/web/src/App.tsx)):
`/login`, `/` (Dashboard), `/clusters/:id/*` → `ClusterLayout` with a sidebar
nav (Overview / Buckets / Keys / Layout / Nodes / Admin Tokens / Workers /
Blocks). `BucketDetail` mounts the federated `BucketObjectBrowser`.

- UI primitives come from `@garage/ui` (not a local `components/ui/`); shared
  non-UI logic from `@garage/web-shared`. Path alias `@` → `src/`.
- [`src/lib/api.ts`](../garage-admin-console/web/src/lib/api.ts) — axios `/api`
  client with JWT injection, 401/403 → `/login`, and a `proxyPath()` helper.
- This package is the **MF Host**; see [Module Federation](#module-federation).
- **No Metrics page by design.** Prometheus metrics are exposed only as a raw
  pass-through at `GET /api/proxy/:clusterId/metrics` (using the cluster's
  optional metric token) — intended for scrapers, not a rendered UI. See the
  note in [`api/src/routes/proxy.ts`](../garage-admin-console/api/src/routes/proxy.ts).

## S3 Browser BFF

Routes (registered in [`src/app.ts`](../s3-browser/api/src/app.ts)):

| Endpoint | Method | Auth | Description |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | No | Authenticate and receive JWT |
| `/api/health` | GET | No | Health check |
| `/api/connections[/:id]` | GET/POST/PUT/DELETE | JWT | CRUD S3 connections (creds excluded from list) |
| `/api/connections/test` | POST | JWT | Test credentials without saving — `{ ok, buckets?, error? }` |
| `/api/connections/:connId/buckets` | GET | JWT | S3 `ListBuckets` (helper) |
| `/api/connections/:connId/buckets/:bucket/*` | various | JWT | [Bucket Backend API](./bucket-api.md) |

Database (`Connection`, `AppSettings`) — see [Database schemas](#database-schemas).
Key files: [`src/lib/s3-client.ts`](../s3-browser/api/src/lib/s3-client.ts)
(`loadConnection()` + `buildS3Client()`),
[`src/routes/buckets.ts`](../s3-browser/api/src/routes/buckets.ts).

## S3 Browser Web

React Router v7 in the standalone shell; the federated `FileBrowser` itself is
kept **router-free** so embedders don't have to pull in react-router.

- Standalone routes: `/` (HomePage / connection cards), `/connections/:id`
  (bucket list), `/connections/:id/b/:bucket/*` (mounts the FileBrowser; the
  splat encodes the in-bucket folder path, so refresh + back/forward work).
- [`src/file-browser/FileBrowser.tsx`](../s3-browser/web/src/file-browser/FileBrowser.tsx)
  is the primary federated surface. It speaks only to the Bucket Backend API via
  axios — **no `@aws-sdk/*` imports anywhere in the frontend**. Conventions that
  keep it embeddable:
  - `path` is parent-controlled (`path: string[]` + `onPathChange`); no internal
    router.
  - Credentials come from `props.backend.{baseUrl, authToken}` — never from
    `localStorage`, `window`, or env vars.
  - It owns its own `QueryClient`, independent of any host's TanStack Query.
- MF Remote config in [`rsbuild.config.ts`](../s3-browser/web/rsbuild.config.ts):
  exposes `./FileBrowser` (plain React) and `./export-app` (`createBridgeComponent`),
  shares `react`/`react-dom` as singletons, build-time `dts`, dev server on `:5174`.

## Module Federation

### Why not `@module-federation/vite` on the host

`@module-federation/vite` wraps the host's MF instance and registers shared
dependencies via build-time transforms. In a Vite-host ⇄ Rsbuild-remote setup
the timing doesn't line up: the Rsbuild-built remote's `consume_default_react`
wrapper runs BEFORE the host's transformed share-register code, so the remote
falls back to its own bundled React copy and React 19's two-copies guard throws
"Invalid hook call" inside the FileBrowser's first `useMemo`.

### What we do instead

The Admin Console host owns federation via `@module-federation/runtime`:

1. [`src/mf-init.ts`](../garage-admin-console/web/src/mf-init.ts) calls `init()`
   synchronously at entry with explicit `lib: () => React` / `() => ReactDOM`
   references, so the host's already-evaluated React is registered in the default
   share scope BEFORE any remote loads. It exports an `mfInstance` handle.
2. [`src/main.tsx`](../garage-admin-console/web/src/main.tsx) imports `./mf-init`
   as its very first line.
3. [`BucketObjectBrowser.tsx`](../garage-admin-console/web/src/components/cluster/BucketObjectBrowser.tsx)
   consumes via `mfInstance.loadRemote('s3Browser/FileBrowser')` inside
   `React.lazy` + `Suspense` + a custom `ErrorBoundary`. The instance method is
   used (not the global `loadRemote`) because the remote auto-registers itself as
   a second producer on load, making the global ambiguous.

### Remote URL & fallback

The remote URL comes from `VITE_S3_BROWSER_MF_URL` (build time) or the
`window.__GARAGE_RUNTIME_CONFIG__` the Admin BFF injects via `runtime-config.js`
(runtime, so one image works across deployments). In development, if unset, the
host derives the manifest URL from the current browser hostname on port `5174`.
The `garage-admin-all` image serves the remote **same-origin** at `/s3-browser`
(`S3_BROWSER_STATIC_DIR`), so no proxy is needed. If the remote is unreachable or
the cluster has no `s3Endpoint`, `BucketObjectBrowser` shows a friendly panel
instead of crashing the page. See [development.md](./development.md) for the
4-process embedded-MF dev workflow.

## Shared packages

Each has its own README:

| Package | Role |
| --- | --- |
| [`@garage/tokens`](../packages/tokens/) | Framework-agnostic design tokens (CSS variables + TS palette) |
| [`@garage/ui`](../packages/ui/) | shadcn/Radix primitives, `Toaster`/`useToast`, `LoginForm`, `cn` — built with tsup |
| [`@garage/web-shared`](../packages/web-shared/) | `createApiClient` / `createAppQueryClient` factories, formatters, `getApiErrorMessage` |
| [`@garage/crypto`](../packages/crypto/) | AES-256-GCM encrypt/decrypt, consumed by both BFFs' `encryption.ts` |
| [`@garage/server-config`](../packages/server-config/) | Env loader, JWT auth router, security response headers, SQLite/migration helpers shared by both BFFs |
| [`@garage/bucket-api-server`](../packages/bucket-api-server/) | The `createBucketRouter(resolveContext)` factory — all S3/multipart logic for the Bucket Backend API |
| [`@garage/bucket-api-contract-tests`](../packages/bucket-api-contract-tests/) | Regression suite that runs the contract against either BFF |

> **Keep both web apps aligned — don't fork them.** New shared UI goes in
> `@garage/ui`, new shared non-UI logic in `@garage/web-shared`; never copy a
> util/component into both apps. Both apps extend the repo-root
> [`tsconfig.base.json`](../tsconfig.base.json) and
> [`eslint.config.base.js`](../eslint.config.base.js).

### The `@garage/ui` CSS cascade

Each app's `src/index.css` pulls in `@garage/tokens`, `@garage/ui`, and Tailwind
v4 as one stylesheet under an explicit `@layer` order (with a `@source`
directive so Tailwind scans `@garage/ui`'s components), so utility classes used
only inside `@garage/ui` aren't tree-shaken out of the host build. The exact
ordering is load-bearing and guarded in CI by `scripts/check-css-cascade.mjs`
(`pnpm check:css`) — the source of truth is each app's
[`src/index.css`](../garage-admin-console/web/src/index.css).

## Database schemas

Both BFFs use Drizzle ORM on SQLite; migrations live in each BFF's `drizzle/` and run
automatically on startup. See [development.md](./development.md#database-management)
for the schema workflow.

- **Admin** ([`schema.ts`](../garage-admin-console/api/src/db/schema.ts)) —
  `Cluster` (`id, name, endpoint, adminToken (enc), metricToken (enc, opt),
  s3Endpoint (opt), s3Region (opt), s3ForcePathStyle (opt), createdAt,
  updatedAt`) + `AppSettings`. The `s3*` columns are nullable; clusters without
  them work everywhere except the embedded browser, which shows a "configure
  s3Endpoint" panel.
- **S3 Browser** ([`schema.ts`](../s3-browser/api/src/db/schema.ts)) —
  `Connection` (`id, name, endpoint, region, forcePathStyle, accessKeyId (enc),
  secretAccessKey (enc), bucket (opt), createdAt, updatedAt`) + `AppSettings`.
