# AGENTS.md

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

## Project Overview

A pnpm workspace shipping **two products that share a design system and a Bucket Backend API contract**:

- **Garage Admin Console** (production) — web interface for managing [Garage](https://garagehq.deuxfleurs.fr/) object storage clusters. Tracks Garage Admin API v2.
- **S3 Browser** (new) — generic S3-protocol file browser. Runs standalone, AND can be **embedded into the Admin Console's bucket detail page via Module Federation 2.0** so users can manage objects without leaving the cluster UI.

The full architectural contract (MF surface, Bucket Backend API, sharing strategy) is frozen in [`designs/mf-integration-plan.md`](./designs/mf-integration-plan.md). Read it before changing anything cross-cutting.

## Repository Layout

```
garage-admin-console/                         # monorepo root
├── garage-admin-console/                     # Admin Console product
│   ├── api/                                  # BFF (Express + Drizzle + LibSQL)
│   └── web/                                  # SPA (React + Vite) — MF Host
├── s3-browser/                               # S3 Browser product
│   ├── api/                                  # BFF (same stack as admin api)
│   └── web/                                  # SPA (React + Rsbuild) — MF Remote
├── packages/
│   ├── tokens/                               # @garage/tokens — CSS variables + palette
│   ├── ui/                                   # @garage/ui — shadcn primitives lifted out
│   └── bucket-api-contract-tests/            # @garage/bucket-api-contract-tests
├── designs/                                  # frozen design specs (incl. mf-integration-plan.md)
├── e2e/                                      # Playwright tests for Admin Console
├── screenshots/                              # rendered Admin Console screenshots for README
├── docker/                                   # Dockerfiles, compose, build ignores
└── pnpm-workspace.yaml                       # garage-admin-console/*, s3-browser/*, packages/*
```

## Commands

```bash
pnpm install                                  # Install all workspaces

# Dev — currently `pnpm dev` launches Admin Console only (api + web in parallel).
# Run S3 Browser in a second terminal:
pnpm dev                                      # Admin: BFF :3001 + Vite :5173
pnpm -C s3-browser/api dev                    # S3 Browser BFF :3002
pnpm -C s3-browser/web dev                    # S3 Browser web :5174

pnpm build                                    # Build shared packages, then Admin api + web
pnpm -C s3-browser/api build                  # S3 Browser BFF
pnpm -C s3-browser/web build                  # S3 Browser web (emits MF manifest)

pnpm lint                                     # Admin api + web (extend per-app if you add lint to s3-browser)
pnpm format / format:check
pnpm test                                     # Admin api + web vitest runs
pnpm -C packages/bucket-api-contract-tests test:run  # contract suite (env-gated)

# Per-workspace
pnpm -C garage-admin-console/api <script>
pnpm -C garage-admin-console/web <script>
pnpm -C s3-browser/api <script>
pnpm -C s3-browser/web <script>

# Type checking
pnpm -C garage-admin-console/api typecheck    # tsc --noEmit
pnpm -C garage-admin-console/web exec tsc --noEmit
pnpm -C s3-browser/api typecheck

# E2E (Admin Console only today)
npx playwright test
```

## Architecture

### Data flow

```
Browser
  ├─→ /api/auth, /api/clusters, /api/proxy/:id/*           (Admin BFF — :3001)
  ├─→ /api/clusters/:id/buckets/:bucket/*                  (Admin BFF — Bucket Backend API)
  └─→ /api/auth, /api/connections, /api/connections/:id/.. (S3 Browser BFF — :3002)
```

- Frontends NEVER call Garage / S3 endpoints directly. Every request hops through a BFF that holds encrypted credentials.
- `Cluster.adminToken` / `Connection.{accessKeyId,secretAccessKey}` are AES-256-GCM encrypted at rest (`encryption.ts` is bit-identical between the two BFFs).
- Embedded mode mints per-(cluster, bucket) S3 keypairs from the cluster's admin token via Garage `CreateKey + AllowBucketKey`, in-memory-cached with a 10-min TTL (see `garage-admin-console/api/src/lib/garage-keys.ts`).

### Bucket Backend API (§2.4 of the integration plan)

The contract surface that BOTH BFFs implement:

| Method + path (relative to bucket scope) | Body / query                                                | Response                                                              |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /list`                              | `?prefix=&delimiter=/&continuationToken=&maxKeys=`          | `{ objects: S3Object[]; prefixes: string[]; nextContinuationToken? }` |
| `GET /object`                            | `?key=`                                                     | `S3Object` (HEAD-equivalent metadata)                                 |
| `POST /presign`                          | `{ key, operation: 'getObject' \| 'putObject', expiresIn }` | `{ url, expiresAt }`                                                  |
| `POST /upload`                           | `multipart/form-data` (one+ files, optional `prefix`)       | `{ uploaded: { key, etag, size }[] }`                                 |
| `DELETE /objects`                        | `{ keys: string[] }`                                        | `{ deleted: string[]; errors: { key, message }[] }`                   |
| `POST /copy`                             | `{ src, dst }`                                              | `{ etag }`                                                            |

Scope prefix:

- Admin BFF: `/api/clusters/:clusterId/buckets/:bucket/...`
- S3 Browser BFF: `/api/connections/:connId/buckets/:bucket/...`

Conformance suite at `packages/bucket-api-contract-tests/` runs against EITHER prefix via `TEST_BFF_FLAVOR=clusters | connections`.

### API Routes

Admin BFF — registered in [`garage-admin-console/api/src/app.ts`](garage-admin-console/api/src/app.ts):

| Route                                                       | Auth | Purpose                                                      |
| ----------------------------------------------------------- | ---- | ------------------------------------------------------------ |
| `POST /api/auth/login`                                      | No   | Returns JWT                                                  |
| `GET  /api/health`                                          | No   | Health check                                                 |
| `GET/POST /api/clusters`                                    | JWT  | List / add clusters (tokens excluded from list)              |
| `PUT/DELETE /api/clusters/:id`                              | JWT  | Update / remove cluster                                      |
| `ALL  /api/proxy/:clusterId/*splat`                         | JWT  | Pass-through to Garage admin API                             |
| `* /api/clusters/:clusterId/buckets/:bucket/*` (Bucket API) | JWT  | §2.4 contract — list, object, presign, upload, objects, copy |

S3 Browser BFF — registered in [`s3-browser/api/src/app.ts`](s3-browser/api/src/app.ts):

| Route                                                       | Auth | Purpose                              |
| ----------------------------------------------------------- | ---- | ------------------------------------ |
| `POST /api/auth/login`                                      | No   | Returns JWT                          |
| `GET  /api/health`                                          | No   | Health check                         |
| `GET/POST/PUT/DELETE /api/connections[/:id]`                | JWT  | CRUD S3 connections                  |
| `GET  /api/connections/:connId/buckets`                     | JWT  | S3 ListBuckets (helper; not in §2.4) |
| `* /api/connections/:connId/buckets/:bucket/*` (Bucket API) | JWT  | §2.4 contract                        |

### Module Federation surface

`s3-browser/web` (Rsbuild + `@module-federation/rsbuild-plugin`) exposes:

| Key             | Source                                       | Wrapper                 |
| --------------- | -------------------------------------------- | ----------------------- |
| `./FileBrowser` | `s3-browser/web/src/export-file-browser.tsx` | none — plain React      |
| `./export-app`  | `s3-browser/web/src/export-app.tsx`          | `createBridgeComponent` |

`garage-admin-console/web` is the Host. It deliberately does NOT use `@module-federation/vite` — that plugin's build-time share registration races the Rsbuild-built remote's `consume_default_react` wrapper and trips React 19's "Invalid hook call" two-copies guard. Instead the host owns federation via `@module-federation/runtime`:

- [`garage-admin-console/web/src/mf-init.ts`](garage-admin-console/web/src/mf-init.ts) calls `init()` at entry with explicit `lib: () => React/ReactDOM` references, exporting an `mfInstance` handle.
- [`BucketObjectBrowser.tsx`](garage-admin-console/web/src/components/cluster/BucketObjectBrowser.tsx) consumes via `mfInstance.loadRemote('s3Browser/FileBrowser')` inside a `React.lazy` + `Suspense` + `ErrorBoundary`.
- Remote URL is `VITE_S3_BROWSER_MF_URL`; in development, if unset, `mf-init.ts` derives it from the current browser hostname on port `5174`.

### Database schemas

**Admin BFF** — [`garage-admin-console/api/src/db/schema.ts`](garage-admin-console/api/src/db/schema.ts), Drizzle on LibSQL:

- `Cluster`: `id, name, endpoint, adminToken (enc), metricToken (enc, opt), s3Endpoint (opt), s3Region (opt), s3ForcePathStyle (opt), createdAt, updatedAt`
- `AppSettings`: `key, value`

The `s3*` columns are optional — clusters that don't set them keep working everywhere except the embedded BucketObjectBrowser, which surfaces a graceful "S3 endpoint not configured" panel.

**S3 Browser BFF** — [`s3-browser/api/src/db/schema.ts`](s3-browser/api/src/db/schema.ts):

- `Connection`: `id, name, endpoint, region, forcePathStyle, accessKeyId (enc), secretAccessKey (enc), createdAt, updatedAt`
- `AppSettings`: `key, value`

Migrations live in each BFF's `drizzle/` directory and run automatically on startup.

### Frontend structure

**Admin Console** (`garage-admin-console/web/src/`) — React Router v7:

- Routing (in `App.tsx`): `/login`, `/` (Dashboard), `/clusters/:id/*` (ClusterLayout + sidebar nav with Overview / Buckets / Keys / Layout / Nodes / Admin Tokens / Workers / Blocks / Metrics).
- BucketDetail mounts the federated `BucketObjectBrowser`.
- UI components from `@garage/ui` (shadcn primitives), tokens from `@garage/tokens`. Path alias `@` → `src/`.

**S3 Browser** (`s3-browser/web/src/`) — view-state navigation, no router (so it can be federated without dragging react-router along):

- Views: `home` (Dashboard with connection cards) → `connection` (bucket list) → `bucket` (FileBrowser).
- Uses the same `@garage/ui` + `@garage/tokens` set so embedded and standalone modes are visually consistent.
- `index.css` mirrors the Admin Console layer order (`@import @garage/tokens/style.css; @import @garage/ui/style.css; @import 'tailwindcss';` then a `@layer base { * { @apply border-border; } }` so Tailwind v4's default `border` resolves to the soft warm tone).

## Frontend UX/UI design principles

### UX

The overall approach progresses from simple to complex, layer by layer.

The outermost layer is the Dashboard page, which lists every cluster (Admin Console) or every connection (S3 Browser). It should present key health, count, and capacity indicators.

Clicking a cluster/connection enters its detail page. Admin Console uses a sidebar navigation; S3 Browser uses a stacked breadcrumb-back flow (Dashboard → Connection → Bucket).

Within each module the same drill-down applies — list pages stay information-light, detail pages go deep (aliases, website access, permissions, object browser, etc.).

### UI

- Theme color is orange `rgb(255, 148, 41)`. Logos live in each web app's `public/`.
- Light-themed only. Dark mode is out of scope.
- Four colors only: theme orange · red (errors) · green (health) · purple (warnings). Don't add a fifth.
- Consistency: pages at the same hierarchy level share style; different levels show slight differences.
- Both apps consume `@garage/ui` + `@garage/tokens` so embedded mode looks identical to standalone.

## Key Files

**Shared / contract**:

- [`designs/mf-integration-plan.md`](designs/mf-integration-plan.md) — frozen architectural contract
- [`packages/bucket-api-contract-tests/src/contract.test.ts`](packages/bucket-api-contract-tests/src/contract.test.ts) — §2.4 conformance suite
- [`packages/ui/src/index.ts`](packages/ui/src/index.ts) / [`packages/tokens/src/style.css`](packages/tokens/src/style.css)

**Admin BFF**:

- `garage-admin-console/web/public/garage-admin-v2.json` — Garage OpenAPI spec
- [`garage-admin-console/api/src/app.ts`](garage-admin-console/api/src/app.ts) — Express setup, route mounting (multipart-aware JSON parser)
- [`garage-admin-console/api/src/encryption.ts`](garage-admin-console/api/src/encryption.ts) — AES-256-GCM (mirrored in s3-browser/api)
- [`garage-admin-console/api/src/lib/garage-keys.ts`](garage-admin-console/api/src/lib/garage-keys.ts) — per-bucket S3 key manager
- [`garage-admin-console/api/src/lib/s3-client.ts`](garage-admin-console/api/src/lib/s3-client.ts) — `@aws-sdk/client-s3` factory
- [`garage-admin-console/api/src/routes/buckets.ts`](garage-admin-console/api/src/routes/buckets.ts) — Bucket Backend API handlers
- [`garage-admin-console/api/src/middleware/auth.middleware.ts`](garage-admin-console/api/src/middleware/auth.middleware.ts)
- [`garage-admin-console/api/src/db/{index,schema,migrate}.ts`](garage-admin-console/api/src/db/schema.ts)

**Admin web**:

- [`garage-admin-console/web/src/mf-init.ts`](garage-admin-console/web/src/mf-init.ts) — explicit MF runtime init
- [`garage-admin-console/web/src/components/cluster/BucketObjectBrowser.tsx`](garage-admin-console/web/src/components/cluster/BucketObjectBrowser.tsx) — embedded FileBrowser wrapper
- [`garage-admin-console/web/src/lib/api.ts`](garage-admin-console/web/src/lib/api.ts) — axios + `proxyPath()` helper
- [`garage-admin-console/web/src/types/garage.ts`](garage-admin-console/web/src/types/garage.ts) — ClusterSummary + Garage response shapes
- [`garage-admin-console/web/src/types/s3-browser.d.ts`](garage-admin-console/web/src/types/s3-browser.d.ts) — `FileBrowserProps` shim for tsc

**S3 Browser BFF**:

- [`s3-browser/api/src/app.ts`](s3-browser/api/src/app.ts)
- [`s3-browser/api/src/lib/s3-client.ts`](s3-browser/api/src/lib/s3-client.ts) — builds `@aws-sdk/client-s3` from a stored Connection
- [`s3-browser/api/src/routes/buckets.ts`](s3-browser/api/src/routes/buckets.ts) — §2.4 handlers

**S3 Browser web**:

- [`s3-browser/web/rsbuild.config.ts`](s3-browser/web/rsbuild.config.ts) — MF Remote config, build-time `dts`, `bridge.enableBridgeRouter: false`
- [`s3-browser/web/src/features/file-browser/FileBrowser.tsx`](s3-browser/web/src/features/file-browser/FileBrowser.tsx) — the federated primary surface
- [`s3-browser/web/src/{export-app,export-file-browser}.tsx`](s3-browser/web/src/export-file-browser.tsx) — MF entry points

## Docker

Docker files live under `docker/`. `docker/garage-admin-console.Dockerfile` builds the **Admin Console** image (Express serves both API and the Vite-built SPA from one image). `docker/s3-browser.Dockerfile` builds one **S3 Browser** product image that can run standalone or in `S3_BROWSER_STATIC_ONLY=true` mode as the Admin-embedded MF remote. `docker/docker-compose.yml` demonstrates the combined deployment with only the Admin port published.

Key production env vars on the Admin image: `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD`, `DATA_DIR` (default `/data`), `STATIC_DIR` (default `/app/static`), and optionally runtime `S3_BROWSER_MF_URL` plus `S3_BROWSER_MF_PROXY_TARGET` for combined deployments.

## Environment Variables

- **Admin BFF**: see [`garage-admin-console/api/.env.example`](garage-admin-console/api/.env.example). Validation in `src/config/env.ts`.
- **Admin web**: see [`garage-admin-console/web/.env.example`](garage-admin-console/web/.env.example) — primarily `VITE_S3_BROWSER_MF_URL`.
- **S3 Browser BFF**: see [`s3-browser/api/.env.example`](s3-browser/api/.env.example).

## Git Workflow

- **Never commit directly to `main`.** Always create a feature branch and open a pull request.
- All commit messages and PR titles (for squash merges) must follow [Conventional Commits](https://www.conventionalcommits.org/) format (`type: description`). This is required for Release Please to generate changelogs and release PRs.

## Versioning

The major version tracks the upstream Garage Admin API version (e.g. API v2 → project `2.x.x`). Major bumps only happen when migrating to a new Garage API version. Within a major version: `fix:` → patch, `feat:` / significant `refactor:` → minor.

## Code Style

- Prettier: 100-char width, single quotes, trailing commas, semicolons, 2-space indent
- ESLint 9 flat config with TypeScript rules; React Hooks + React Refresh plugins on frontends
- All packages use ES modules and strict TypeScript
