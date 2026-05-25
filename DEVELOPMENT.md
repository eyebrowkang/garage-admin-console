# Development Guide

This document is the in-depth developer reference for the Garage Admin Console + S3 Browser monorepo. For a top-down summary read [AGENTS.md](./AGENTS.md). For the architectural contract that governs the embedded file browser, read [`designs/mf-integration-plan.md`](./designs/mf-integration-plan.md).

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Development Setup](#development-setup)
- [Repository Layout](#repository-layout)
- [Admin BFF (`garage-admin-console/api`)](#admin-bff-garage-admin-consoleapi)
- [Admin Web (`garage-admin-console/web`)](#admin-web-garage-admin-consoleweb)
- [S3 Browser BFF (`s3-browser/api`)](#s3-browser-bff-s3-browserapi)
- [S3 Browser Web (`s3-browser/web`)](#s3-browser-web-s3-browserweb)
- [Shared Packages (`packages/*`)](#shared-packages-packages)
- [Module Federation](#module-federation)
- [Bucket Backend API](#bucket-backend-api)
- [Testing](#testing)
- [Database Management](#database-management)
- [Code Style](#code-style)
- [Common Tasks](#common-tasks)
- [Docker Build](#docker-build)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### System design

The repo ships **two products that intentionally share a design system and a Bucket Backend API contract**, plus a thin MF glue so the S3 Browser's `FileBrowser` component can be embedded directly into the Admin Console's bucket detail page.

```
┌──────────────────────────────────────────────────────────────┐
│                         Browser                              │
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
│  - Drizzle + LibSQL  │                │  - Drizzle + LibSQL   │
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

1. **BFF proxy pattern.** Frontends NEVER talk to Garage / S3 endpoints directly. Every request flows through a BFF that holds encrypted credentials and never returns them to the client.
2. **Two BFFs, one contract.** Both BFFs implement the same [Bucket Backend API](#bucket-backend-api). The federated `FileBrowser` component is bound only to that contract, not to a particular BFF.
3. **Encrypted credentials.** Garage admin tokens (`Cluster.adminToken`) and S3 keypairs (`Connection.{accessKeyId,secretAccessKey}`) are AES-256-GCM encrypted at rest. The two `encryption.ts` files are bit-identical.
4. **Per-bucket short-lived S3 keys in embedded mode.** Admin BFF mints a per-(cluster, bucket) S3 keypair via Garage `CreateKey + AllowBucketKey`, caches in-memory with a 10-minute TTL ([`garage-admin-console/api/src/lib/garage-keys.ts`](garage-admin-console/api/src/lib/garage-keys.ts)). Restart re-mints.
5. **Single admin password per BFF.** Simple authentication model. JWT tokens are issued with 24-hour expiry. The two BFFs are independent auth realms by default (no shared JWT secret).
6. **Monorepo with shared packages.** `@garage/tokens` and `@garage/ui` are **build-time** workspace deps consumed by both web apps — not runtime MF singletons. That gives independent versioning, clean types, and no runtime negotiation overhead.

---

## Development Setup

### Prerequisites

- **Node.js** 24.x or later
- **pnpm** 10.x or later

### Initial setup

```bash
# 1. Clone the repository
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

# 2. Install dependencies (all workspaces)
pnpm install

# 3. Approve native builds if prompted
pnpm approve-builds

# 4. Create env files
cp garage-admin-console/api/.env.example garage-admin-console/api/.env
cp s3-browser/api/.env.example s3-browser/api/.env   # optional, only if running S3 Browser

# 5. Start development servers (databases auto-migrate on startup)
pnpm dev                       # Admin api :3001 + web :5173 (in parallel)

# Optional second terminal — run S3 Browser too
pnpm -C s3-browser/api dev     # BFF :3002
pnpm -C s3-browser/web dev     # web :5174, exposes /mf-manifest.json
```

### Environment variables

#### Admin BFF (`garage-admin-console/api/.env`)

| Variable         | Required | Description                                                                          |
| ---------------- | -------- | ------------------------------------------------------------------------------------ |
| `JWT_SECRET`     | Yes      | Secret for JWT signing (random 32+ char string)                                      |
| `ENCRYPTION_KEY` | Yes      | AES-256 key (exactly 32 bytes)                                                       |
| `ADMIN_PASSWORD` | Yes      | Console login password                                                               |
| `PORT`           | No       | API server port (default: `3001`)                                                    |
| `LOG_LEVEL`      | No       | `fatal` / `error` / `warn` / `info` / `debug` / `trace` / `silent` (default: `info`) |
| `MORGAN_FORMAT`  | No       | HTTP log format for morgan, or `off` to disable                                      |

Validation: `garage-admin-console/api/src/config/env.ts`. Database lives at `garage-admin-console/api/data.db` in dev, or `$DATA_DIR/data.db` (`/data` by default) in Docker.

#### Admin web (`garage-admin-console/web/.env`)

| Variable                 | Required | Description                                                                                                                                                                                                                                         |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_S3_BROWSER_MF_URL` | No       | URL of the s3-browser/web MF manifest. In development, defaults to the current browser hostname on port `5174`; set it explicitly at build time for production. If unset / unreachable, the embedded BucketObjectBrowser shows a friendly fallback. |

#### S3 Browser BFF (`s3-browser/api/.env`)

Same shape as the Admin BFF — `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD` required; `PORT` defaults to `3002`. The two BFFs do not share secrets by default.

### Development servers

```bash
# Admin (api + web in parallel)
pnpm dev

# Each individually
pnpm -C garage-admin-console/api dev    # :3001
pnpm -C garage-admin-console/web dev    # :5173

# S3 Browser
pnpm -C s3-browser/api dev              # :3002
pnpm -C s3-browser/web dev              # :5174

# Vite + Rsbuild proxy /api/* to their respective BFFs.
```

---

## Repository Layout

```
garage-admin-console/                              # monorepo root
├── garage-admin-console/                          # Admin Console product
│   ├── api/                                       # BFF
│   │   ├── src/
│   │   │   ├── app.ts                            # Express setup + route mounting
│   │   │   ├── index.ts                          # server entrypoint
│   │   │   ├── encryption.ts                     # AES-256-GCM
│   │   │   ├── logger.ts                         # Pino
│   │   │   ├── config/env.ts                     # env validation
│   │   │   ├── middleware/auth.middleware.ts     # JWT verify
│   │   │   ├── db/
│   │   │   │   ├── index.ts                      # Drizzle client
│   │   │   │   ├── schema.ts                     # Cluster, AppSettings
│   │   │   │   ├── migrate.ts                    # runs on startup
│   │   │   │   └── seed.ts
│   │   │   ├── lib/
│   │   │   │   ├── garage-keys.ts                # per-bucket S3 key manager
│   │   │   │   └── s3-client.ts                  # @aws-sdk/client-s3 factory
│   │   │   └── routes/
│   │   │       ├── auth.ts                       # POST /auth/login
│   │   │       ├── clusters.ts                   # CRUD /clusters
│   │   │       ├── proxy.ts                      # ALL /proxy/:clusterId/*splat
│   │   │       └── buckets.ts                    # Bucket Backend API (§2.4)
│   │   └── drizzle/                              # migration SQL + meta
│   └── web/
│       ├── src/
│       │   ├── main.tsx                          # entry — imports ./mf-init FIRST
│       │   ├── mf-init.ts                        # explicit MF runtime init
│       │   ├── App.tsx                           # router + layouts
│       │   ├── layouts/{MainLayout,ClusterLayout}.tsx
│       │   ├── pages/
│       │   │   ├── Login.tsx, Dashboard.tsx
│       │   │   └── cluster/                      # per-module pages (Buckets, Keys, …)
│       │   ├── components/
│       │   │   ├── cluster/
│       │   │   │   ├── BucketObjectBrowser.tsx   # ← embeds federated FileBrowser
│       │   │   │   └── (ConfirmDialog, ModulePageHeader, DetailPageHeader, …)
│       │   │   └── dashboard/ClusterStatusMonitor.tsx
│       │   ├── hooks/                            # TanStack Query hooks
│       │   ├── contexts/ClusterContext.tsx
│       │   ├── lib/api.ts                        # axios + proxyPath()
│       │   ├── types/
│       │   │   ├── garage.ts                     # Garage API + ClusterSummary (with s3* fields)
│       │   │   └── s3-browser.d.ts               # FileBrowserProps shim for tsc
│       │   └── index.css                         # imports tokens + ui + tailwindcss
│       ├── public/garage-admin-v2.json           # Garage OpenAPI spec
│       ├── vite.config.ts                        # NO @module-federation/vite plugin — see comment
│       └── .env.example                          # VITE_S3_BROWSER_MF_URL
│
├── s3-browser/                                    # S3 Browser product
│   ├── api/
│   │   ├── src/
│   │   │   ├── app.ts                            # multipart-aware JSON parser
│   │   │   ├── encryption.ts                     # mirror of admin's
│   │   │   ├── db/schema.ts                      # Connection, AppSettings
│   │   │   ├── lib/s3-client.ts                  # builds S3 client from a stored Connection
│   │   │   └── routes/
│   │   │       ├── auth.ts, connections.ts
│   │   │       └── buckets.ts                    # Bucket Backend API (§2.4)
│   │   └── drizzle/
│   └── web/
│       ├── src/
│       │   ├── main.tsx, bootstrap.tsx           # MF async-boundary entry
│       │   ├── export-app.tsx                    # createBridgeComponent
│       │   ├── export-file-browser.tsx           # plain React (the primary surface)
│       │   ├── App.tsx                           # state-based home → connection → bucket
│       │   ├── features/
│       │   │   ├── auth/LoginPage.tsx
│       │   │   ├── home/HomePage.tsx             # Dashboard with connection cards
│       │   │   ├── connection/ConnectionView.tsx # bucket list
│       │   │   ├── bucket/BucketView.tsx         # wraps FileBrowser
│       │   │   └── file-browser/FileBrowser.{tsx,css}   # ← THE federated component
│       │   ├── lib/{api.ts, connection-display.ts, format.ts, types.ts}
│       │   └── index.css
│       ├── public/                               # S3 Browser logos
│       └── rsbuild.config.ts                     # MF Remote config, build-time dts
│
├── packages/
│   ├── tokens/                                   # @garage/tokens
│   │   └── src/{style.css, index.ts}             # CSS variables (palette, radii)
│   ├── ui/                                       # @garage/ui — shadcn primitives + cn()
│   │   ├── src/components/{alert,badge,button,card,checkbox,dialog,
│   │   │                    dropdown-menu,input,label,select,sheet,
│   │   │                    skeleton,table,textarea,toast,tooltip}.tsx
│   │   └── dist/                                 # built ESM + style.css
│   └── bucket-api-contract-tests/                # @garage/bucket-api-contract-tests
│       └── src/{env.ts, client.ts, contract.test.ts}
│
├── designs/                                      # frozen architecture specs
│   ├── mf-integration-plan.md
│   ├── garage-admin-design-system/
│   └── s3-browser/
│
├── e2e/                                          # Playwright (Admin Console)
│   ├── fixtures.ts, helpers.ts
│   ├── auth.spec.ts, cluster.spec.ts, buckets.spec.ts, keys.spec.ts
│
├── screenshots/                                  # rendered Admin Console screenshots
├── docker/                                       # Dockerfiles, compose, build ignores
├── playwright.config.ts
├── package.json, pnpm-workspace.yaml
└── README.md, README_zh.md, AGENTS.md, CONTRIBUTING.md, DEVELOPMENT.md, CHANGELOG.md
```

---

## Admin BFF (`garage-admin-console/api`)

### Routes

Registered in [`src/app.ts`](garage-admin-console/api/src/app.ts):

| Endpoint                                                                             | Method  | Auth | Description                                    |
| ------------------------------------------------------------------------------------ | ------- | ---- | ---------------------------------------------- |
| `/api/auth/login`                                                                    | POST    | No   | Authenticate and receive JWT                   |
| `/api/health`                                                                        | GET     | No   | Health check                                   |
| `/api/clusters`                                                                      | GET     | JWT  | List clusters (tokens excluded)                |
| `/api/clusters`                                                                      | POST    | JWT  | Add a cluster                                  |
| `/api/clusters/:id`                                                                  | PUT     | JWT  | Update a cluster                               |
| `/api/clusters/:id`                                                                  | DELETE  | JWT  | Remove a cluster                               |
| `/api/proxy/:clusterId/*splat`                                                       | ALL     | JWT  | Pass-through to Garage Admin API               |
| `/api/clusters/:clusterId/buckets/:bucket/{list,object,presign,upload,objects,copy}` | various | JWT  | [Bucket Backend API](#bucket-backend-api) §2.4 |

Notes:

- The JSON body parser skips `multipart/form-data` so busboy can stream uploads.
- Bucket-API requests mint or reuse a cached per-(cluster, bucket) S3 keypair before signing the S3 call.

### Database schema

Defined in [`src/db/schema.ts`](garage-admin-console/api/src/db/schema.ts) using Drizzle ORM:

- **`Cluster`** — `id, name, endpoint, adminToken (enc), metricToken (enc, opt), s3Endpoint (opt), s3Region (opt), s3ForcePathStyle (opt), createdAt, updatedAt`
- **`AppSettings`** — key-value store

The `s3*` columns are nullable. Clusters without them keep working everywhere except the embedded BucketObjectBrowser, which shows a "configure s3Endpoint" panel.

Migrations:

- `0000_init.sql` — initial schema
- `0001_curious_purple_man.sql` — adds the three `s3*` columns

Migrations run automatically on startup via `runMigrations()` in [`src/db/migrate.ts`](garage-admin-console/api/src/db/migrate.ts).

### Key files

- [`src/app.ts`](garage-admin-console/api/src/app.ts) — Express setup, multipart-aware JSON parser, route mounting
- [`src/index.ts`](garage-admin-console/api/src/index.ts) — server entry
- [`src/db/{index,schema,migrate}.ts`](garage-admin-console/api/src/db/schema.ts) — Drizzle plumbing
- [`src/encryption.ts`](garage-admin-console/api/src/encryption.ts) — AES-256-GCM (bit-identical to `s3-browser/api/src/encryption.ts`)
- [`src/middleware/auth.middleware.ts`](garage-admin-console/api/src/middleware/auth.middleware.ts) — JWT verify
- [`src/lib/garage-keys.ts`](garage-admin-console/api/src/lib/garage-keys.ts) — per-bucket S3 key minting + in-memory cache (TTL 10 min)
- [`src/lib/s3-client.ts`](garage-admin-console/api/src/lib/s3-client.ts) — `@aws-sdk/client-s3` factory with `requestChecksumCalculation: 'WHEN_REQUIRED'`
- [`src/routes/buckets.ts`](garage-admin-console/api/src/routes/buckets.ts) — Bucket Backend API handlers
- [`src/routes/proxy.ts`](garage-admin-console/api/src/routes/proxy.ts) — Garage admin API pass-through

---

## Admin Web (`garage-admin-console/web`)

### Routing

Defined in [`src/App.tsx`](garage-admin-console/web/src/App.tsx) (React Router v7):

```
/login                          → Login page
/                               → Dashboard (cluster list, MainLayout)
/clusters/:id                   → ClusterLayout (sidebar nav)
  ./                            → Cluster Overview
  ./buckets                     → BucketList
  ./buckets/:bid                → BucketDetail ← embeds BucketObjectBrowser
  ./keys / keys/:kid            → Access Keys list / detail
  ./nodes / nodes/:nid          → Nodes list / detail
  ./layout                      → Layout manager
  ./tokens / tokens/:tid        → Admin token list / detail
  ./blocks                      → Block manager
  ./workers                     → Worker manager
/clusters/:id/metrics           → Prometheus metrics (standalone)
```

### Component organization

- **Layouts** (`src/layouts/`): `MainLayout` (top bar + Sign Out) and `ClusterLayout` (sticky cluster sidebar with module nav, mobile pill nav, badge counts).
- **Reusable cluster components** (`src/components/cluster/`):

| Component                                                                   | Purpose                                                                                                  |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `BucketObjectBrowser.tsx`                                                   | **Phase 3 embed** — `mfInstance.loadRemote('s3Browser/FileBrowser')` + ErrorBoundary + s3Endpoint gating |
| `ConfirmDialog.tsx`                                                         | 3-tier confirmation dialog (simple / danger / type-to-confirm)                                           |
| `ModulePageHeader.tsx`                                                      | Consistent page header for module list pages                                                             |
| `DetailPageHeader.tsx`                                                      | Page header for detail pages with back navigation                                                        |
| `SecretReveal.tsx`                                                          | One-time secret display                                                                                  |
| `NodeSelector.tsx`                                                          | Node selection dropdown                                                                                  |
| `JsonViewer.tsx`                                                            | JSON display component                                                                                   |
| `CopyButton.tsx`                                                            | Click-to-copy button                                                                                     |
| `AliasMiniChip.tsx`                                                         | Compact alias badge                                                                                      |
| `PageLoadingState.tsx` / `InlineLoadingState.tsx` / `TableLoadingState.tsx` | Loading states                                                                                           |
| `TableEmptyState.tsx`                                                       | Empty state for tables                                                                                   |

- **Dashboard components** (`src/components/dashboard/`): `ClusterStatusMonitor.tsx` and friends.
- **UI primitives** come from `@garage/ui` (not from `web/src/components/ui/`). The Admin Console's host stylesheet imports tokens + UI CSS + Tailwind in that order.

### Custom hooks

In `src/hooks/`:

| Hook             | Purpose                                   |
| ---------------- | ----------------------------------------- |
| `useClusters`    | Cluster CRUD                              |
| `useBuckets`     | Bucket operations                         |
| `useKeys`        | Access key operations                     |
| `useNodes`       | Node info + cluster status queries        |
| `useBlocks`      | Block error management                    |
| `useWorkers`     | Worker management                         |
| `useAdminTokens` | Admin token CRUD                          |
| `usePermissions` | Bucket-key permission grants (allow/deny) |

### API client

Defined in [`src/lib/api.ts`](garage-admin-console/web/src/lib/api.ts):

- Axios instance with `/api` base URL
- JWT token injection via request interceptor
- Automatic redirect to `/login` on 401/403
- `proxyPath(clusterId, path)` helper for Garage API URLs

Garage API type definitions live in [`src/types/garage.ts`](garage-admin-console/web/src/types/garage.ts). The federated `FileBrowserProps` shim lives in [`src/types/s3-browser.d.ts`](garage-admin-console/web/src/types/s3-browser.d.ts) so `tsc` is happy even before `s3-browser/web`'s `@mf-types/` directory is generated.

### Module Federation as host

This package is the **MF Host** for the federated `FileBrowser`. The vite federation plugin is deliberately omitted; see [Module Federation](#module-federation) for the full story.

---

## S3 Browser BFF (`s3-browser/api`)

### Routes

Registered in [`src/app.ts`](s3-browser/api/src/app.ts):

| Endpoint                                                                             | Method     | Auth | Description                                             |
| ------------------------------------------------------------------------------------ | ---------- | ---- | ------------------------------------------------------- |
| `/api/auth/login`                                                                    | POST       | No   | Authenticate and receive JWT                            |
| `/api/health`                                                                        | GET        | No   | Health check                                            |
| `/api/connections`                                                                   | GET/POST   | JWT  | CRUD list/create connections (creds excluded from list) |
| `/api/connections/:id`                                                               | PUT/DELETE | JWT  | Update / delete a connection                            |
| `/api/connections/:connId/buckets`                                                   | GET        | JWT  | S3 `ListBuckets` (helper; not in §2.4)                  |
| `/api/connections/:connId/buckets/:bucket/{list,object,presign,upload,objects,copy}` | various    | JWT  | [Bucket Backend API](#bucket-backend-api) §2.4          |

### Database schema

Defined in [`src/db/schema.ts`](s3-browser/api/src/db/schema.ts):

- **`Connection`** — `id, name, endpoint, region, forcePathStyle, accessKeyId (enc), secretAccessKey (enc), createdAt, updatedAt`
- **`AppSettings`** — key-value store

### Key files

- [`src/app.ts`](s3-browser/api/src/app.ts) — multipart-aware JSON parser, route mounting
- [`src/lib/s3-client.ts`](s3-browser/api/src/lib/s3-client.ts) — `loadConnection()` + `buildS3Client()` from a stored Connection
- [`src/routes/buckets.ts`](s3-browser/api/src/routes/buckets.ts) — §2.4 handlers (the canonical implementation; admin's was ported from this)

---

## S3 Browser Web (`s3-browser/web`)

### Layout

State-based navigation (no router — the bundle stays small and the federated `FileBrowser` doesn't get react-router pulled in alongside it):

- `home` — Dashboard with connection cards + fleet summary + add/edit/delete
- `connection` — bucket grid for one connection
- `bucket` — wraps the `FileBrowser` with a breadcrumb header

The standalone shell ([`App.tsx`](s3-browser/web/src/App.tsx), [`features/home`](s3-browser/web/src/features/home/HomePage.tsx), …) is built on `@garage/ui` so it mirrors the Admin Console's Dashboard/Detail patterns 1:1.

### The federated `FileBrowser` component

[`src/features/file-browser/FileBrowser.tsx`](s3-browser/web/src/features/file-browser/FileBrowser.tsx) is the primary federated surface. It speaks only to the Bucket Backend API via axios — **no `@aws-sdk/*` imports anywhere in the frontend**.

Hard rules (per `designs/mf-integration-plan.md` §2.5):

- `path` is parent-controlled (`path: string[]` + `onPathChange`). No internal router.
- Credentials come from `props.backend.{baseUrl, authToken}`. Not from `localStorage`, `window`, or env vars.
- Owns its own `QueryClient` so it's independent of any host's TanStack Query.

### MF Remote configuration

[`rsbuild.config.ts`](s3-browser/web/rsbuild.config.ts) exposes:

```ts
exposes: {
  './export-app': './src/export-app.tsx',
  './FileBrowser': './src/export-file-browser.tsx',
},
shared: {
  react:     { singleton: true, requiredVersion: '^19' },
  'react-dom': { singleton: true, requiredVersion: '^19' },
},
dts: command === 'build',
bridge: { enableBridgeRouter: false },
```

Dev server runs on `:5174`, exposes `/mf-manifest.json` and `/remoteEntry.js`. Federated DTS generation stays enabled for `rsbuild build` only, so dev avoids the local type-broker WebSocket on `127.0.0.1:16322`.

---

## Shared Packages (`packages/*`)

### `@garage/tokens`

Framework-agnostic design tokens:

- [`src/style.css`](packages/tokens/src/style.css) — CSS variables (palette, radii, semantic colors) used by both web apps' `index.css`
- [`src/index.ts`](packages/tokens/src/index.ts) — same palette as TS constants for JS-driven theming

Importing the stylesheet **once** at the host's entry CSS populates `--primary`, `--border`, `--success`, etc.

### `@garage/ui`

shadcn/Radix primitives lifted into a workspace package:

- Source in `packages/ui/src/components/` — `alert`, `badge`, `button`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `sheet`, `skeleton`, `table`, `textarea`, `toast`, `tooltip`
- `cn()` helper in `packages/ui/src/lib/cn.ts`
- Built with `tsup` to `dist/` (ESM + `.d.ts` + pre-compiled `dist/style.css`)
- `peerDependencies`: `react`, `react-dom`. `dependencies`: `@garage/tokens` (`workspace:*`).

Importing pattern in both apps:

```ts
import { Button, Card, CardContent, cn } from '@garage/ui';
```

The host's `index.css` MUST import in this order so Tailwind v4 resolves them together:

```css
@import '@garage/tokens/style.css';
@import '@garage/ui/style.css';
@import 'tailwindcss';

@theme { … }
@layer base { * { @apply border-border; } /* makes the default border resolve to the soft warm tone */ }
```

Splitting these imports across CSS and JS (e.g. importing `@garage/ui/style.css` from JS) causes Tailwind v4 to tree-shake utility classes referenced by `@garage/ui` but not used in the host's source files. The visible symptom is buttons rendering with dark text on the orange primary background (`text-primary-foreground` missing).

### `@garage/bucket-api-contract-tests`

Vitest suite that exercises every §2.4 route. Env-gated so `pnpm test` works offline.

Run against the Admin BFF:

```bash
export TEST_BFF_URL=http://localhost:3001/api
export TEST_BFF_PASSWORD=admin
export TEST_BFF_FLAVOR=clusters
export TEST_CLUSTER_ID=<your cluster id from /api/clusters>
export TEST_S3_BUCKET=s3-browser-test    # must already exist; cluster's s3Endpoint must be set
pnpm -C packages/bucket-api-contract-tests test:run
```

Run against the S3 Browser BFF (default flavor):

```bash
export TEST_BFF_URL=http://localhost:3002/api
export TEST_BFF_PASSWORD=admin
export TEST_CONNECTION_ID=<your connection id from /api/connections>
export TEST_S3_BUCKET=s3-browser-test
pnpm -C packages/bucket-api-contract-tests test:run
```

See [`packages/bucket-api-contract-tests/README.md`](packages/bucket-api-contract-tests/README.md) for the full env reference and the auto-create-connection flow.

---

## Module Federation

### Why not `@module-federation/vite` on the host

`@module-federation/vite` wraps the host's MF instance under an `__mfe_internal__*` name and registers shared dependencies via build-time transforms. In a Vite-host ⇄ Rsbuild-remote setup the timing doesn't line up: the Rsbuild-built remote's `consume_default_react` wrapper runs BEFORE the host's transformed share-register code, so the remote falls back to its own bundled React copy and React 19's two-copies guard throws "Invalid hook call" inside the FileBrowser's first `useMemo`.

### What we do instead

The Admin Console host owns federation via `@module-federation/runtime`:

1. [`src/mf-init.ts`](garage-admin-console/web/src/mf-init.ts) calls `init()` synchronously at entry. It passes `lib: () => React`, `lib: () => ReactDOM`, etc., so the host's already-evaluated React modules are registered in the default share scope BEFORE any remote loads.
2. The returned `mfInstance` is exported.
3. [`src/main.tsx`](garage-admin-console/web/src/main.tsx) imports `./mf-init` as its very first line.
4. [`BucketObjectBrowser.tsx`](garage-admin-console/web/src/components/cluster/BucketObjectBrowser.tsx) consumes via `mfInstance.loadRemote('s3Browser/FileBrowser')` inside `React.lazy` + `Suspense` + a custom `ErrorBoundary`. The instance method is used (not the global `loadRemote`) because the s3Browser remote auto-registers itself as a second producer on load, making the global ambiguous.

### Remote URL

Configured by `VITE_S3_BROWSER_MF_URL`. In development, if the variable is unset, the host derives the manifest URL from the current browser hostname on port `5174`, so `localhost` and LAN URLs both resolve to the matching S3 Browser dev server. Set it at **build time** for production deployments.

### Fallback behavior

If the remote is unreachable or the cluster has no `s3Endpoint` configured, BucketObjectBrowser shows a friendly panel instead of crashing the BucketDetail page. The rest of the Admin Console keeps working.

---

## Bucket Backend API

The contract that both BFFs implement. Frozen in `designs/mf-integration-plan.md` §2.4.

**Scope prefix** (relative to BFF base URL):

- Admin: `/api/clusters/:clusterId/buckets/:bucket/...`
- S3 Browser: `/api/connections/:connId/buckets/:bucket/...`

**Routes** (relative to scope):

| Method | Path       | Body / query                                              | Response                                                              |
| ------ | ---------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| GET    | `/list`    | `?prefix=&delimiter=/&continuationToken=&maxKeys=`        | `{ objects: S3Object[]; prefixes: string[]; nextContinuationToken? }` |
| GET    | `/object`  | `?key=`                                                   | `S3Object` (HEAD-equivalent)                                          |
| POST   | `/presign` | `{ key, operation: 'getObject'\|'putObject', expiresIn }` | `{ url, expiresAt }`                                                  |
| POST   | `/upload`  | `multipart/form-data` (one+ files, optional `prefix`)     | `{ uploaded: { key, etag, size }[] }`                                 |
| DELETE | `/objects` | `{ keys: string[] }`                                      | `{ deleted: string[]; errors: { key, message }[] }`                   |
| POST   | `/copy`    | `{ src, dst }`                                            | `{ etag }`                                                            |

All routes require `Authorization: Bearer <jwt>`. Error envelope is `{ error: string | Issue[] }` (Zod issues for validation errors).

---

## Testing

### API tests (Vitest)

```bash
pnpm -C garage-admin-console/api test:run
pnpm -C s3-browser/api test:run
```

Test files live alongside source under `*/src/test/` or `*.test.ts` adjacent to the unit under test.

### Web unit tests (Vitest)

```bash
pnpm -C garage-admin-console/web test          # watch mode
pnpm -C garage-admin-console/web test:run      # one shot
pnpm -C garage-admin-console/web test:coverage # with coverage
```

Tests are colocated with sources using `.test.ts` / `.test.tsx`. Setup file: `web/src/test/setup.ts`.

### Bucket Backend API conformance

```bash
pnpm -C packages/bucket-api-contract-tests test:run
```

Skips cleanly when env vars are missing. See [Shared Packages](#shared-packages-packages) for the env recipe.

### E2E (Playwright)

```bash
npx playwright test                          # all Admin Console E2E tests
npx playwright test --ui                     # UI mode
npx playwright test e2e/auth.spec.ts         # specific file
npx playwright show-report                   # last report
```

Config in [`playwright.config.ts`](playwright.config.ts). Tests run against Chromium at `http://localhost:5173`; the dev server auto-starts via `pnpm dev` if not already running.

Test fixtures (`e2e/fixtures.ts`) provide pre-authenticated page setup; shared helpers in `e2e/helpers.ts`.

---

## Database Management

### Commands

```bash
pnpm -C garage-admin-console/api db:generate   # create migration from schema diff
pnpm -C garage-admin-console/api db:push       # direct push (dev only)
pnpm -C garage-admin-console/api db:seed       # run seed script
pnpm -C garage-admin-console/api db:studio     # Drizzle Studio GUI

pnpm -C s3-browser/api db:generate             # same scripts on the S3 Browser BFF
pnpm -C s3-browser/api db:push
pnpm -C s3-browser/api db:studio
```

### Schema workflow

1. Edit the relevant `src/db/schema.ts`.
2. `pnpm -C <bff> db:generate --name=<description>`.
3. Commit the generated `drizzle/*.sql` + `meta/*.json`.
4. Migrations apply automatically on the next BFF start via `runMigrations()` in `src/db/migrate.ts`. No separate migration step in Docker or CI.

`db:push` is fine for local prototyping; never use it for production data.

---

## Code Style

### Formatting

- **Prettier** with 100-char line width, single quotes, trailing commas, semicolons, 2-space indent
- Config in `prettier.config.cjs`

```bash
pnpm format          # Format Admin packages
pnpm format:check    # Check formatting
```

### Linting

- **ESLint 9** flat config with TypeScript support
- React Hooks + React Refresh plugins on frontends

```bash
pnpm lint                       # Admin packages
pnpm lint:fix                   # Auto-fix Admin
```

To extend lint to the S3 Browser packages, add their lint scripts to the root `package.json` or run `pnpm -C s3-browser/api lint` / `pnpm -C s3-browser/web lint` directly.

### Type Checking

```bash
pnpm -C garage-admin-console/api typecheck
pnpm -C garage-admin-console/web build      # types are checked by tsc during build
pnpm -C s3-browser/api typecheck
```

### Conventions

- TypeScript strict mode everywhere
- ES modules throughout
- `@/` path alias for both web apps
- Business logic extracted into custom hooks
- TanStack Query for data fetching (each app owns its own `QueryClient`)
- `@garage/ui` + `@garage/tokens` for visual primitives — do not duplicate
- Frontends never import `@aws-sdk/*` or `react-router-dom` into the federated `FileBrowser` surface (the latter is just a stylistic rule for the S3 Browser web shell)

---

## Common Tasks

### Adding a new page (Admin)

1. Create component in `garage-admin-console/web/src/pages/` (or `pages/cluster/`).
2. Add route in `App.tsx`.
3. Create any new hooks in `src/hooks/`.
4. Add types to `src/types/garage.ts` if needed.

### Adding a new view (S3 Browser)

1. Create a view component under `s3-browser/web/src/features/...`.
2. Wire it through `App.tsx`'s `ViewState` discriminated union.

### Adding a new API endpoint

1. Pick the BFF (admin or s3-browser) and create/update a route handler in its `src/routes/`.
2. Register the route in that BFF's `src/app.ts`.
3. Add Zod schema for request validation.
4. Update frontend hooks + API calls.

### Extending the Bucket Backend API (§2.4)

Any change to the contract is breaking by definition (see `designs/mf-integration-plan.md` §4 invariants):

1. Update §2.4 in `designs/mf-integration-plan.md` and §2.5 (FileBrowserProps) if relevant.
2. Implement in BOTH BFFs (`garage-admin-console/api/src/routes/buckets.ts` and `s3-browser/api/src/routes/buckets.ts`).
3. Update `packages/bucket-api-contract-tests/src/{client.ts,contract.test.ts}` to cover the new shape.
4. Update the federated `FileBrowser` in `s3-browser/web/src/features/file-browser/FileBrowser.tsx`.
5. Bump the relevant package versions in the same PR.

### Adding a UI primitive

Add it under `packages/ui/src/components/`, export from `packages/ui/src/index.ts`, rebuild (`pnpm -F @garage/ui build`), then import via `@garage/ui` from either web app. Do NOT add new shadcn primitives directly into either web app's source tree.

### Adding a new Garage API integration

1. Check `garage-admin-console/web/public/garage-admin-v2.json` for endpoint spec.
2. Add TypeScript types to `garage-admin-console/web/src/types/garage.ts`.
3. Create or update a hook in `src/hooks/`.
4. Update relevant page components.

---

## Docker Build

### How it works

`docker/garage-admin-console.Dockerfile` builds the **Admin Console only** as a single image. Multi-stage:

1. **Build stage** (`node:24-alpine`) — installs deps with frozen lockfile, builds `@garage/tokens` and `@garage/ui` (the web app consumes their pre-compiled outputs), then compiles the Admin API and Vite frontend. Uses `pnpm deploy --legacy /deploy` to produce a standalone API directory with production-only `node_modules`.
2. **Production stage** (`node:24-alpine`) — copies the deployed API, Drizzle migration files, and the built frontend (`/app/static/`).

The Express server serves the SPA from `/app/static/` with SPA fallback. Migrations run automatically on startup. All API routes live under `/api`, matching the frontend's default `VITE_API_BASE_URL=/api`, which avoids collisions with client-side routes.

The image works standalone — the BucketObjectBrowser surfaces a friendly fallback when no S3 Browser remote is configured. For combined deployments, set `S3_BROWSER_MF_URL` at runtime; when using the bundled Compose file, Admin also proxies `/s3-browser/*` to the internal S3 Browser container through `S3_BROWSER_MF_PROXY_TARGET`.

### Key files

| File                                     | Purpose                                    |
| ---------------------------------------- | ------------------------------------------ |
| `docker/garage-admin-console.Dockerfile` | Multi-stage Admin image build              |
| `docker/s3-browser.Dockerfile`           | Full S3 Browser image build                |
| `docker/docker-compose.yml`              | Example Compose configuration              |
| `docker/*.Dockerfile.dockerignore`       | Dockerfile-specific build-context excludes |
| `docker/.env.compose.example`            | Example Compose environment file           |

### Building

```bash
docker build -f docker/garage-admin-console.Dockerfile -t garage-admin-console .
```

### Environment variables (production)

| Variable                     | Required | Default       | Description                                         |
| ---------------------------- | -------- | ------------- | --------------------------------------------------- |
| `JWT_SECRET`                 | Yes      | —             | Secret for JWT signing                              |
| `ENCRYPTION_KEY`             | Yes      | —             | AES-256 key (exactly 32 characters)                 |
| `ADMIN_PASSWORD`             | Yes      | —             | Console login password                              |
| `PORT`                       | No       | `3001`        | Server port                                         |
| `LOG_LEVEL`                  | No       | `info`        | Log level                                           |
| `DATA_DIR`                   | No       | `/data`       | Directory for SQLite database                       |
| `STATIC_DIR`                 | No       | `/app/static` | Directory for frontend files                        |
| `S3_BROWSER_MF_URL`          | No       | —             | Browser-visible MF manifest URL                     |
| `S3_BROWSER_MF_PROXY_TARGET` | No       | —             | Internal upstream for Admin's `/s3-browser/*` proxy |

### Data persistence

```yaml
volumes:
  - garage-data:/data
```

### S3 Browser images

`docker/s3-browser.Dockerfile` builds one product image that can run either as the standalone S3 Browser product or as a static-only MF remote for Admin.

```bash
docker build -f docker/s3-browser.Dockerfile -t s3-browser .
```

Default mode starts the S3 Browser API, runs migrations, and serves the standalone SPA/MF remote. `S3_BROWSER_STATIC_ONLY=true` skips API env validation and database startup, serving only the built static frontend and MF manifest.

The bundled combined deployment uses:

```bash
cp docker/.env.compose.example docker/.env
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

---

## Troubleshooting

### Common issues

**pnpm install fails with native module errors**

```bash
pnpm approve-builds
pnpm install
```

**Database connection errors**

```bash
# Ensure data.db is readable/writable
# Reset if corrupted (loses local state)
rm -f garage-admin-console/api/data.db
pnpm -C garage-admin-console/api db:push
```

**Port already in use**

```bash
lsof -ti:3001 | xargs kill -9   # Admin BFF
lsof -ti:5173 | xargs kill -9   # Admin web
lsof -ti:3002 | xargs kill -9   # S3 Browser BFF
lsof -ti:5174 | xargs kill -9   # S3 Browser web
```

**TypeScript errors after pulling changes**

```bash
pnpm install
pnpm -F @garage/ui build
pnpm -C garage-admin-console/web build
```

**Embedded FileBrowser shows "S3 endpoint not configured"**

The cluster row's `s3Endpoint` is null. Edit the cluster from the Admin Dashboard and add it (Garage's default S3 port is `:3900`).

**Embedded FileBrowser shows "S3 Browser unavailable — Retry"**

The MF manifest is unreachable. Check `VITE_S3_BROWSER_MF_URL` if set, and confirm that `pnpm -C s3-browser/web dev --host 0.0.0.0` is running when testing from another LAN host.

**"Invalid hook call" inside the federated FileBrowser**

Means two React copies. The Admin host MUST own MF via `src/mf-init.ts` and load via `mfInstance.loadRemote(...)`. Do NOT add `@module-federation/vite` to the host's plugin list — see the comment in `garage-admin-console/web/vite.config.ts`.

### Debug mode

```bash
# Admin BFF verbose
LOG_LEVEL=debug MORGAN_FORMAT=dev pnpm -C garage-admin-console/api dev

# S3 Browser BFF verbose
LOG_LEVEL=debug MORGAN_FORMAT=dev pnpm -C s3-browser/api dev

# Vite debug output
DEBUG=vite:* pnpm -C garage-admin-console/web dev
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contribution guide, including commit conventions and PR process.
