# Development Guide

This document provides comprehensive guidance for developers working on the Garage Admin Console.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [API Package](#api-package)
- [Web Package](#web-package)
- [Testing](#testing)
- [Database Management](#database-management)
- [Code Style](#code-style)
- [Common Tasks](#common-tasks)
- [Docker Build](#docker-build)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### System Design

The Garage Admin Console follows a **Backend-For-Frontend (BFF)** proxy pattern:

```
┌──────────────────────────────────────────────────────────────┐
│                         Browser                              │
└─────────────────────────────┬────────────────────────────────┘
                              │ HTTP
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Frontend (React SPA)                       │
│  - React 19 + TypeScript                                     │
│  - TanStack React Query (data fetching)                      │
│  - React Router v7 (routing)                                 │
│  - Tailwind CSS + shadcn/ui (styling)                        │
│  - ECharts (visualizations)                                  │
└─────────────────────────────┬────────────────────────────────┘
                              │ /api/* (proxied in dev)
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     BFF API (Express)                        │
│  - Express 5 + TypeScript                                    │
│  - JWT authentication                                        │
│  - Prisma ORM (SQLite/LibSQL)                                │
│  - AES-256-GCM credential encryption                         │
└─────────────────────────────┬────────────────────────────────┘
                              │ /proxy/:clusterId/*
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Garage Clusters                            │
│  - Admin API v2 endpoints                                    │
│  - Multiple clusters supported                               │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **BFF Proxy Pattern**: The frontend never communicates directly with Garage clusters. All API calls are proxied through the BFF, which:
   - Manages encrypted credential storage
   - Handles authentication
   - Provides a unified API surface

2. **Single Admin Password**: Simple authentication model using a single admin password. JWT tokens are issued with 24-hour expiry.

3. **Encrypted Credentials**: Garage admin tokens are stored encrypted using AES-256-GCM (see `api/src/encryption.ts`). They are only decrypted in memory when proxying requests.

4. **Monorepo Structure**: Both API and frontend live in a single repository using pnpm workspaces.

---

## Development Setup

### Prerequisites

- **Node.js** 24.x or later
- **pnpm** 10.x or later

### Initial Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd garage-admin-console

# 2. Install dependencies
pnpm install

# 3. Approve native builds if prompted
pnpm approve-builds

# 4. Create environment file
cp api/.env.example api/.env
# Edit api/.env with your settings

# 5. Initialize the database
pnpm -C api db:push

# 6. Start development servers
pnpm dev
```

### Environment Variables

Create `api/.env` from `api/.env.example`. Available variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Secret for JWT signing (random 32+ char string) |
| `ENCRYPTION_KEY` | Yes | AES-256 key (exactly 32 bytes) |
| `ADMIN_PASSWORD` | Yes | Console login password |
| `PORT` | No | API server port (default: `3001`) |
| `LOG_LEVEL` | No | System log level: fatal, error, warn, info, debug, trace, silent (default: `info`) |
| `MORGAN_FORMAT` | No | HTTP log format for morgan, or `off` to disable (default: `dev` in development) |

Environment validation is handled in `api/src/config/env.ts`. In development, the database is stored at `api/data.db`. In Docker, the `DATA_DIR` environment variable controls the database location (defaults to `/data`).

### Development Servers

```bash
# Start both API and frontend
pnpm dev

# Or start individually
pnpm -C api dev    # API on http://localhost:3001
pnpm -C web dev    # Frontend on http://localhost:5173
```

The frontend dev server proxies `/api/*` requests to the backend automatically (configured in `web/vite.config.ts`).

---

## Project Structure

```
garage-admin-console/
├── api/                          # Backend-For-Frontend service
│   ├── src/
│   │   ├── index.ts              # Server entry point
│   │   ├── app.ts                # Express app setup and route registration
│   │   ├── db.ts                 # Prisma client initialization
│   │   ├── encryption.ts         # AES-256-GCM utilities
│   │   ├── logger.ts             # Pino logger configuration
│   │   ├── config/
│   │   │   └── env.ts            # Environment variable validation
│   │   ├── middleware/
│   │   │   └── auth.middleware.ts # JWT verification
│   │   └── routes/
│   │       ├── auth.ts           # POST /auth/login
│   │       ├── clusters.ts       # CRUD /clusters
│   │       └── proxy.ts          # ALL /proxy/:clusterId/*
│   ├── prisma/
│   │   └── schema.prisma         # Database schema
│   └── package.json
│
├── web/                          # Frontend SPA
│   ├── src/
│   │   ├── main.tsx              # React entry point
│   │   ├── App.tsx               # Root component with routing
│   │   ├── pages/                # Page components
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── cluster/          # Cluster detail pages
│   │   ├── layouts/
│   │   │   ├── MainLayout.tsx    # Top-level header layout
│   │   │   └── ClusterLayout.tsx # Sidebar navigation layout
│   │   ├── components/
│   │   │   ├── ui/               # shadcn/ui primitives
│   │   │   ├── cluster/          # Reusable cluster components
│   │   │   └── dashboard/        # Dashboard components
│   │   ├── hooks/                # Custom React hooks
│   │   ├── contexts/             # React contexts
│   │   ├── lib/                  # Utility functions
│   │   └── types/                # TypeScript types
│   ├── public/
│   │   └── garage-admin-v2.json  # Garage OpenAPI spec
│   ├── vite.config.ts
│   └── package.json
│
├── e2e/                          # End-to-end tests (Playwright)
│   ├── fixtures.ts               # Test fixtures
│   ├── helpers.ts                # Shared test helpers
│   ├── auth.spec.ts
│   ├── cluster.spec.ts
│   ├── buckets.spec.ts
│   └── keys.spec.ts
│
├── package.json                  # Workspace configuration
├── pnpm-workspace.yaml
└── playwright.config.ts
```

---

## API Package

### Routes

Routes are registered in `api/src/app.ts`.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/auth/login` | POST | No | Authenticate and receive JWT |
| `/health` | GET | No | Health check |
| `/clusters` | GET | JWT | List all clusters |
| `/clusters` | POST | JWT | Add a new cluster |
| `/clusters/:id` | PUT | JWT | Update a cluster |
| `/clusters/:id` | DELETE | JWT | Remove a cluster |
| `/proxy/:clusterId/*` | ALL | JWT | Proxy to Garage cluster |

### Database Schema

Defined in `api/prisma/schema.prisma`. Two models:

- **Cluster** — `id`, `name`, `endpoint`, `adminToken` (AES-256-GCM encrypted), `metricToken` (encrypted, optional), `createdAt`, `updatedAt`
- **AppSettings** — Key-value store (`key`, `value`)

### Key Files

- `api/src/app.ts` — Express app setup, middleware, and route registration
- `api/src/index.ts` — Server entry point
- `api/src/db.ts` — Prisma client with LibSQL adapter
- `api/src/encryption.ts` — AES-256-GCM encrypt/decrypt functions
- `api/src/middleware/auth.middleware.ts` — JWT verification middleware
- `api/src/routes/proxy.ts` — Garage API proxy with credential decryption

---

## Web Package

### Routing Structure

Defined in `web/src/App.tsx`:

```
/login                        → Login page
/                             → Dashboard (cluster list)
/clusters/:id                 → Cluster detail (sidebar layout)
  /clusters/:id/              → Overview
  /clusters/:id/buckets       → Bucket list
  /clusters/:id/buckets/:bid  → Bucket detail
  /clusters/:id/keys          → Key list
  /clusters/:id/keys/:kid     → Key detail
  /clusters/:id/nodes         → Node list
  /clusters/:id/nodes/:nid    → Node detail
  /clusters/:id/layout        → Layout manager
  /clusters/:id/tokens        → Admin token list
  /clusters/:id/tokens/:tid   → Admin token detail
  /clusters/:id/blocks        → Block manager
  /clusters/:id/workers       → Worker manager
/clusters/:id/metrics         → Prometheus metrics (standalone)
```

### Component Organization

Reusable cluster components live in `web/src/components/cluster/`:

| Component | Purpose |
|-----------|---------|
| `ConfirmDialog.tsx` | 3-tier confirmation dialog (simple / danger / type-to-confirm) |
| `ModulePageHeader.tsx` | Consistent page header for module list pages |
| `DetailPageHeader.tsx` | Page header for detail pages with back navigation |
| `SecretReveal.tsx` | One-time secret display |
| `NodeSelector.tsx` | Node selection dropdown |
| `JsonViewer.tsx` | JSON display component |
| `CopyButton.tsx` | Click-to-copy button |
| `AliasMiniChip.tsx` | Compact alias badge |
| `PageLoadingState.tsx` | Full-page loading spinner |
| `InlineLoadingState.tsx` | Inline loading indicator |

Dashboard components live in `web/src/components/dashboard/` (e.g., `ClusterStatusMonitor.tsx`).

UI primitives (button, dialog, table, etc.) are in `web/src/components/ui/`, built on shadcn/ui and Radix UI.

### Custom Hooks

Located in `web/src/hooks/`:

| Hook | Purpose |
|------|---------|
| `useClusters` | Cluster CRUD operations |
| `useBuckets` | Bucket operations |
| `useKeys` | Access key operations |
| `useNodes` | Node info and cluster status queries |
| `useBlocks` | Block error management |
| `useWorkers` | Worker management |
| `useAdminTokens` | Admin token CRUD |
| `usePermissions` | Bucket-key permission grants (allow/deny) |

### API Client

The API client is defined in `web/src/lib/api.ts`. It provides:

- Axios instance with base URL configuration
- JWT token injection via request interceptor
- Automatic redirect to login on 401/403 responses
- `proxyPath(clusterId, path)` helper for constructing Garage API proxy URLs

Garage API type definitions are in `web/src/types/garage.ts`.

---

## Testing

### Unit Tests (Vitest)

```bash
pnpm -C web test          # Run in watch mode
pnpm -C web test:run      # Run once
pnpm -C web test:coverage # Run with coverage
```

Unit tests are located alongside source files with `.test.ts` or `.test.tsx` extension. Test setup is in `web/src/test/setup.ts`.

### E2E Tests (Playwright)

```bash
npx playwright test                    # Run all E2E tests
npx playwright test --ui               # Run with UI
npx playwright test e2e/auth.spec.ts   # Run specific test file
npx playwright show-report             # View report
```

Configuration is in `playwright.config.ts`. Tests run against Chromium with base URL `http://localhost:5173`, and auto-start the dev server if not running.

Test fixtures (`e2e/fixtures.ts`) provide pre-authenticated page setup. Shared navigation helpers are in `e2e/helpers.ts`.

---

## Database Management

### Quick Commands

```bash
pnpm -C api db:migrate   # Apply pending migrations (safe for production)
pnpm -C api db:push      # Push schema directly (development only)
pnpm -C api db:seed      # Run seed script
pnpm -C api db:studio    # Open Prisma Studio GUI
```

### Schema Changes

This project uses Prisma Migrate for schema management. The workflow:

1. Edit `api/prisma/schema.prisma`
2. Generate a migration: `pnpm -C api npx prisma migrate dev --name <description>`
3. The migration SQL is saved to `api/prisma/migrations/` and committed to version control

In production (Docker), `prisma migrate deploy` runs automatically on container startup, applying any pending migrations safely without data loss.

`db:push` is available for development convenience (e.g., rapid prototyping) but should not be used for production databases.

### Regenerate Client

After schema changes, regenerate the Prisma client:

```bash
pnpm -C api npx prisma generate
```

---

## Code Style

### Formatting

- **Prettier** with 100-char line width, single quotes, trailing commas, semicolons, 2-space indent
- Configuration in `prettier.config.cjs`

```bash
pnpm format        # Format all files
pnpm format:check  # Check formatting
```

### Linting

- **ESLint 9** flat config with TypeScript support
- React Hooks and React Refresh plugins for frontend

```bash
pnpm lint      # Lint all files
pnpm lint:fix  # Auto-fix issues
```

### Type Checking

```bash
pnpm -C api typecheck  # Check API types (tsc --noEmit)
pnpm -C web build      # Web types are checked during build
```

### Conventions

- TypeScript strict mode in both packages
- ES modules throughout
- `@/` path alias for imports in web package (configured in `web/vite.config.ts`)
- Business logic extracted into custom hooks
- TanStack Query for all data fetching

---

## Common Tasks

### Adding a New Page

1. Create page component in `web/src/pages/` (or `web/src/pages/cluster/` for cluster pages)
2. Add route in `web/src/App.tsx`
3. Create any necessary hooks in `web/src/hooks/`
4. Add types in `web/src/types/garage.ts` if needed

### Adding a New API Endpoint

1. Create or update route handler in `api/src/routes/`
2. Register route in `api/src/app.ts`
3. Add Zod schema for request validation
4. Update frontend API calls as needed

### Adding a UI Component

For shadcn/ui components: `npx shadcn-ui@latest add <component>` (installs to `web/src/components/ui/`).

For custom cluster components: create in `web/src/components/cluster/`.

### Adding a New Garage API Integration

1. Check `web/public/garage-admin-v2.json` for endpoint specification
2. Add TypeScript types to `web/src/types/garage.ts`
3. Create or update hook in `web/src/hooks/`
4. Update relevant page components

---

## Docker Build

### How It Works

The `Dockerfile` uses a multi-stage build to produce a single image containing both the API and frontend:

1. **Build stage** (`node:24-alpine`) — installs dependencies, compiles TypeScript, builds the Vite frontend, and creates a standalone production deployment using `pnpm deploy --legacy`
2. **Production stage** (`node:24-alpine`) — copies the deployed API (with production-only `node_modules`) and the built frontend static files

In production, the Express server serves the frontend from `/app/static/` with SPA fallback (see `api/src/index.ts`). The frontend is built with `VITE_API_BASE_URL=/` so API requests go directly to the same origin — no separate reverse proxy is needed.

### Key Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build definition |
| `docker-compose.yml` | Example Compose configuration |
| `.dockerignore` | Files excluded from build context |

### Building

```bash
docker build -t garage-admin-console .
```

### Environment Variables (Production)

These variables are set in `docker-compose.yml` or passed via `docker run -e`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | Secret for JWT signing |
| `ENCRYPTION_KEY` | Yes | — | AES-256 key (exactly 32 characters) |
| `ADMIN_PASSWORD` | Yes | — | Console login password |
| `PORT` | No | `3001` | Server port |
| `LOG_LEVEL` | No | `info` | Log level |
| `DATA_DIR` | No | `/data` | Directory for SQLite database |
| `STATIC_DIR` | No | `/app/static` | Directory for frontend files |

### Data Persistence

The SQLite database is stored in the `DATA_DIR` directory (`/data` by default). Mount a volume to this path to persist data across container restarts:

```yaml
volumes:
  - garage-data:/data
```

---

## Troubleshooting

### Common Issues

**pnpm install fails with native module errors**
```bash
pnpm approve-builds
pnpm install
```

**Prisma client not found**
```bash
pnpm -C api npx prisma generate
```

**Database connection errors**
```bash
# Ensure api/data.db is readable/writable
# Reset database if corrupted
rm -f api/data.db
pnpm -C api db:push
```

**Port already in use**
```bash
lsof -ti:3001 | xargs kill -9   # Kill process on port 3001
lsof -ti:5173 | xargs kill -9   # Kill process on port 5173
```

**TypeScript errors after pulling changes**
```bash
pnpm -C api npx prisma generate
pnpm -C web build
```

### Debug Mode

```bash
# Enable verbose logging for API
LOG_LEVEL=debug MORGAN_FORMAT=dev pnpm -C api dev

# View Vite debug output
DEBUG=vite:* pnpm -C web dev
```

---

## Contributing

1. Create a feature branch from `main`
2. Make your changes following the code style guidelines
3. Add tests for new functionality
4. Ensure all checks pass: `pnpm lint && pnpm -C web test:run && npx playwright test`
5. Create a pull request with a clear description

### Commit Messages

Use conventional commit format:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks
