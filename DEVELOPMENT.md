# Development Guide

Comprehensive guide for developers working on the Garage Admin Console monorepo.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Admin Console](#admin-console)
- [S3 Browser](#s3-browser)
- [Shared Packages](#shared-packages)
- [Module Federation](#module-federation)
- [Testing](#testing)
- [Database Management](#database-management)
- [Code Style](#code-style)
- [Common Tasks](#common-tasks)
- [Docker Build](#docker-build)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Install dependencies
pnpm install
pnpm approve-builds    # if prompted

# 2. Configure environment
cp apps/admin/api/.env.example apps/admin/api/.env
cp apps/s3-browser/api/.env.example apps/s3-browser/api/.env
# Edit both .env files

# 3. Start development (databases auto-migrate on startup)
pnpm dev
```

| App | API | Web |
|-----|-----|-----|
| Admin Console | http://localhost:3001 | http://localhost:5173 |
| S3 Browser | http://localhost:3002 | http://localhost:5174 |

### Selective Startup

```bash
pnpm dev:admin    # Admin API (3001) + Web (5173) only
pnpm dev:s3       # S3 Browser API (3002) + Web (5174) only
```

### Environment Variables

Each API app has its own `.env` file. See `.env.example` in each API directory for all options.

**Required** (both apps):

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret for JWT signing (random 32+ char string) |
| `ENCRYPTION_KEY` | AES-256 key (exactly 32 ASCII characters) |
| `ADMIN_PASSWORD` | Console login password |

**Optional** (both apps):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` / `3002` | API server port |
| `LOG_LEVEL` | `info` | Log level: fatal, error, warn, info, debug, trace, silent |
| `MORGAN_FORMAT` | `dev` (development) | HTTP log format for morgan, or `off` to disable |

---

## Architecture Overview

See [docs/architecture.md](./docs/architecture.md) for detailed diagrams.

Both apps follow a **Backend-For-Frontend (BFF) proxy pattern** — the browser never communicates directly with storage services. Credentials are encrypted at rest and only decrypted in-memory when proxying requests.

---

## Project Structure

```
garage-admin-console/
├── apps/
│   ├── admin/
│   │   ├── api/                        # Admin BFF service
│   │   │   ├── src/
│   │   │   │   ├── index.ts            # Server entry point
│   │   │   │   ├── app.ts              # Express app setup and route registration
│   │   │   │   ├── config/env.ts       # Environment variable validation
│   │   │   │   ├── db/                 # Drizzle ORM (schema, migrations, client)
│   │   │   │   ├── encryption.ts       # AES-256-GCM utilities
│   │   │   │   ├── middleware/         # JWT auth middleware
│   │   │   │   └── routes/             # auth, clusters, proxy
│   │   │   └── drizzle/                # Migration SQL files
│   │   └── web/                        # Admin SPA (MF Host)
│   │       └── src/
│   │           ├── App.tsx             # Root component with routing
│   │           ├── pages/              # Page components
│   │           ├── layouts/            # MainLayout, ClusterLayout
│   │           ├── components/         # ui/, cluster/, dashboard/
│   │           ├── hooks/              # React Query hooks
│   │           ├── lib/api.ts          # Axios client with JWT interceptors
│   │           └── types/garage.ts     # Garage API type definitions
│   │
│   └── s3-browser/
│       ├── api/                        # S3 Browser BFF service
│       │   └── src/
│       │       ├── app.ts              # Express app setup
│       │       ├── config/env.ts       # Environment validation
│       │       ├── db/                 # Drizzle ORM (connections table)
│       │       ├── encryption.ts       # AES-256-GCM utilities
│       │       ├── lib/s3-client.ts    # S3Client factory
│       │       └── routes/             # auth, connections, s3 operations
│       └── web/                        # S3 Browser SPA (MF Remote)
│           └── src/
│               ├── App.tsx             # Routes and QueryClient
│               ├── pages/              # Dashboard, BucketList, ObjectBrowserPage, Login
│               ├── layouts/            # MainLayout, ConnectionLayout
│               ├── components/         # ObjectBrowser, BucketExplorer, UploadDialog, etc.
│               ├── providers/          # S3EmbedProvider (MF context)
│               ├── hooks/              # Connection context hook
│               └── lib/                # api.ts, embed-api.ts
│
├── packages/
│   ├── auth/                           # @garage-admin/auth — JWT middleware factory
│   ├── ui/                             # @garage-admin/ui — Shared shadcn/ui components
│   └── tsconfig/                       # @garage-admin/tsconfig — Shared TS configs
│
├── docker/                             # Dockerfiles (admin, s3-browser, combined)
├── docs/                               # Architecture, deployment, MF, S3 Browser guides
├── e2e/                                # Playwright E2E tests
└── [config files]                      # pnpm-workspace.yaml, prettier, eslint, etc.
```

---

## Admin Console

### API Routes

Routes are registered in `apps/admin/api/src/app.ts`.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/login` | POST | No | Authenticate and receive JWT |
| `/api/health` | GET | No | Health check |
| `/api/clusters` | GET | JWT | List all clusters |
| `/api/clusters` | POST | JWT | Add a new cluster |
| `/api/clusters/:id` | PUT | JWT | Update a cluster |
| `/api/clusters/:id` | DELETE | JWT | Remove a cluster |
| `/api/proxy/:clusterId/*` | ALL | JWT | Proxy to Garage cluster |

### Database Schema

Defined in `apps/admin/api/src/db/schema.ts` using Drizzle ORM:

- **Cluster** — `id`, `name`, `endpoint`, `adminToken` (encrypted), `metricToken` (encrypted, optional), `createdAt`, `updatedAt`
- **AppSettings** — Key-value store (`key`, `value`)

### Frontend Routing

Defined in `apps/admin/web/src/App.tsx`:

```
/login                          → Login page
/                               → Dashboard (cluster list)
/clusters/:id                   → Cluster detail (sidebar layout)
  /clusters/:id/                → Overview
  /clusters/:id/buckets         → Bucket list
  /clusters/:id/buckets/:bid    → Bucket detail
  /clusters/:id/keys            → Key list
  /clusters/:id/keys/:kid       → Key detail
  /clusters/:id/nodes           → Node list
  /clusters/:id/nodes/:nid      → Node detail
  /clusters/:id/layout          → Layout manager
  /clusters/:id/tokens          → Admin token list
  /clusters/:id/tokens/:tid     → Admin token detail
  /clusters/:id/blocks          → Block manager
  /clusters/:id/workers         → Worker manager
/clusters/:id/metrics           → Prometheus metrics
/s3-test                        → S3 Browser MF test page
```

### Custom Hooks

Located in `apps/admin/web/src/hooks/`:

| Hook | Purpose |
|------|---------|
| `useClusters` | Cluster CRUD operations |
| `useBuckets` | Bucket operations |
| `useKeys` | Access key operations |
| `useNodes` | Node info and cluster status |
| `useBlocks` | Block error management |
| `useWorkers` | Worker management |
| `useAdminTokens` | Admin token CRUD |
| `usePermissions` | Bucket-key permission grants |

---

## S3 Browser

See [docs/s3-browser.md](./docs/s3-browser.md) for the full feature guide and API reference.

### API Routes

Routes are registered in `apps/s3-browser/api/src/app.ts`.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/login` | POST | No | Authenticate and receive JWT |
| `/api/health` | GET | No | Health check |
| `/api/connections` | GET/POST | JWT | List/create connections |
| `/api/connections/:id` | PUT/DELETE | JWT | Update/delete connection |
| `/api/s3/:connectionId/buckets` | GET | JWT | List buckets |
| `/api/s3/:connectionId/objects` | GET/DELETE | JWT | List/delete objects |
| `/api/s3/:connectionId/objects/download` | GET | JWT | Download object |
| `/api/s3/:connectionId/objects/upload` | POST | JWT | Upload file(s) |
| `/api/s3/:connectionId/objects/folder` | POST | JWT | Create folder |

### Frontend Routing

Defined in `apps/s3-browser/web/src/App.tsx`:

```
/login                          → Login page
/                               → Dashboard (connection list)
/connections/:id                → Connection detail (bucket list or auto-redirect)
/connections/:id/browse         → Object browser (?bucket=X&prefix=Y)
```

---

## Shared Packages

### @garage-admin/auth

JWT auth middleware factory used by both apps:

```ts
import { createAuthMiddleware } from '@garage-admin/auth';
const authenticateToken = createAuthMiddleware({ secret: env.jwtSecret });
app.use('/api/clusters', authenticateToken, clusterRoutes);
```

### @garage-admin/ui

Shared shadcn/ui components: `Button`, `Card`, `cn()` utility. Built on Radix UI primitives.

```ts
import { Button, cn } from '@garage-admin/ui';
```

### @garage-admin/tsconfig

Base TypeScript configs: `base.json`, `react.json`, `node.json`.

---

## Module Federation

See [docs/module-federation.md](./docs/module-federation.md) for the full integration guide.

The S3 Browser web app (remote) exposes components that the Admin Console web app (host) can load dynamically. During development, both apps must be running for MF to work.

---

## Testing

### E2E Tests (Playwright)

```bash
npx playwright test                    # Run all
npx playwright test --ui               # Interactive UI
npx playwright test e2e/auth.spec.ts   # Specific file
npx playwright show-report             # View report
```

Configuration in `playwright.config.ts`. Tests run against Chromium with auto-started dev server.

### Unit Tests

```bash
pnpm test                              # Run all tests across workspace
pnpm -C apps/admin/web test            # Admin web tests only
```

---

## Database Management

Both apps use Drizzle ORM with LibSQL (SQLite). Migrations run automatically on startup.

### Admin Console

```bash
pnpm -C apps/admin/api db:generate     # Generate migration from schema changes
pnpm -C apps/admin/api db:push         # Push schema directly (dev only)
pnpm -C apps/admin/api db:seed         # Run seed script
pnpm -C apps/admin/api db:studio       # Open Drizzle Studio GUI
```

Schema: `apps/admin/api/src/db/schema.ts` | Migrations: `apps/admin/api/drizzle/`

### S3 Browser

The S3 Browser uses the same Drizzle pattern. Schema in `apps/s3-browser/api/src/db/schema.ts`.

### Schema Change Workflow

1. Edit the relevant `schema.ts`
2. Generate migration: `pnpm -C apps/<app>/api db:generate --name=<description>`
3. Migration SQL is saved to `<app>/api/drizzle/` and committed to version control
4. Migrations auto-apply on next startup

---

## Code Style

### Formatting & Linting

```bash
pnpm format        # Auto-format all files (Prettier)
pnpm format:check  # Check formatting
pnpm lint          # Lint all packages (ESLint)
pnpm lint:fix      # Auto-fix lint issues
pnpm typecheck     # Type-check all packages
```

### Conventions

- **Prettier**: 100-char width, single quotes, trailing commas, semicolons, 2-space indent
- **ESLint 9**: Flat config with TypeScript rules; React Hooks + React Refresh plugins on frontend
- **TypeScript**: Strict mode, ES modules throughout
- **Path alias**: `@/` → `src/` in all web packages
- **Data fetching**: TanStack React Query for all API calls
- **Commit messages**: [Conventional Commits](https://www.conventionalcommits.org/) required

---

## Common Tasks

### Adding a New Page (Admin)

1. Create component in `apps/admin/web/src/pages/`
2. Add route in `apps/admin/web/src/App.tsx`
3. Create hooks in `apps/admin/web/src/hooks/` if needed
4. Add types in `apps/admin/web/src/types/garage.ts`

### Adding a New Page (S3 Browser)

1. Create component in `apps/s3-browser/web/src/pages/`
2. Add route in `apps/s3-browser/web/src/App.tsx`
3. Add API routes in `apps/s3-browser/api/src/routes/` if needed

### Adding a UI Component

For shadcn/ui primitives shared across apps: add to `packages/ui/`.

For app-specific components: add to the app's `components/` directory.

### Adding a New API Endpoint

1. Create or update route handler in `apps/<app>/api/src/routes/`
2. Register route in the app's `app.ts`
3. Add Zod schema for request validation
4. Update frontend API calls

---

## Docker Build

Three Dockerfiles in `docker/`:

| File | Purpose | Port |
|------|---------|------|
| `admin.Dockerfile` | Standalone admin console | 3001 |
| `s3-browser.Dockerfile` | Standalone S3 browser | 3002 |
| `combined.Dockerfile` | Both apps in one image | 3001 |

```bash
docker build -t garage-admin -f docker/admin.Dockerfile .
docker build -t s3-browser -f docker/s3-browser.Dockerfile .
docker build -t garage-combined -f docker/combined.Dockerfile .
```

All use multi-stage builds with `node:24-alpine`. See [docs/deployment.md](./docs/deployment.md) for Compose examples and production configuration.

---

## Troubleshooting

### pnpm install fails with native module errors

```bash
pnpm approve-builds
pnpm install
```

### Database errors

```bash
# Reset admin database
rm -f apps/admin/api/data.db
# Restart — migrations auto-run

# Reset S3 Browser database
rm -f apps/s3-browser/api/s3-browser.db
```

### Port already in use

Check which process is using the port and stop it manually.

### TypeScript errors after pulling changes

```bash
pnpm install
pnpm build
```

### Module Federation not loading

Ensure both apps are running (`pnpm dev`). The host loads `remoteEntry.js` from `http://localhost:5174/remoteEntry.js` — the S3 Browser dev server must be accessible.

### Debug Mode

```bash
# Verbose API logging
LOG_LEVEL=debug MORGAN_FORMAT=dev pnpm -C apps/admin/api dev

# Vite debug output
DEBUG=vite:* pnpm -C apps/admin/web dev
```
