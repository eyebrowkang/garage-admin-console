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
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### System Design

The Garage Admin Console follows a **Backend-For-Frontend (BFF)** proxy pattern:

```
┌──────────────────────────────────────────────────────────────┐
│                         Browser                               │
└─────────────────────────────┬────────────────────────────────┘
                              │ HTTP
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Frontend (React SPA)                       │
│  - React 19 + TypeScript                                      │
│  - TanStack React Query (data fetching)                       │
│  - React Router v7 (routing)                                  │
│  - Tailwind CSS + shadcn/ui (styling)                         │
│  - ECharts (visualizations)                                   │
└─────────────────────────────┬────────────────────────────────┘
                              │ /api/* (proxied in dev)
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     BFF API (Express)                         │
│  - Express 5 + TypeScript                                     │
│  - JWT authentication                                         │
│  - Prisma ORM (SQLite/LibSQL)                                 │
│  - AES-256-GCM credential encryption                          │
└─────────────────────────────┬────────────────────────────────┘
                              │ /proxy/:clusterId/*
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Garage Clusters                            │
│  - Admin API v2 endpoints                                     │
│  - Multiple clusters supported                                │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **BFF Proxy Pattern**: The frontend never communicates directly with Garage clusters. All API calls are proxied through the BFF, which:
   - Manages encrypted credential storage
   - Handles authentication
   - Provides a unified API surface

2. **Single Admin Password**: Simple authentication model using a single admin password. JWT tokens are issued with 24-hour expiry.

3. **Encrypted Credentials**: Garage admin tokens are stored encrypted using AES-256-GCM. They are only decrypted in memory when proxying requests.

4. **Monorepo Structure**: Both API and frontend live in a single repository using pnpm workspaces.

---

## Development Setup

### Prerequisites

- **Node.js** 20.x or later
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
pnpm -C api npx prisma migrate dev

# 6. Start development servers
pnpm dev
```

### Environment Variables

Create `api/.env` with the following:

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret for JWT signing | Random 32+ char string |
| `ENCRYPTION_KEY` | AES-256 key (exactly 32 bytes) | `01234567890123456789012345678901` |
| `PORT` | API server port | `3001` |
| `ADMIN_PASSWORD` | Console login password | `change-me` |
| `LOG_LEVEL` | System log level | `info` |
| `MORGAN_FORMAT` | HTTP log format (morgan) | `dev` |

The database file is fixed to `api/data.db` and is not configurable.

### Development Servers

```bash
# Start both API and frontend
pnpm dev

# Or start individually
pnpm -C api dev    # API on http://localhost:3001
pnpm -C web dev    # Frontend on http://localhost:5173
```

The frontend dev server proxies API requests to the backend automatically.

---

## Project Structure

```
garage-admin-console/
├── api/                          # Backend-For-Frontend service
│   ├── src/
│   │   ├── index.ts              # Express app entry point
│   │   ├── db.ts                 # Prisma client initialization
│   │   ├── encryption.ts         # AES-256-GCM utilities
│   │   ├── middleware/
│   │   │   └── auth.middleware.ts
│   │   └── routes/
│   │       ├── auth.ts           # POST /auth/login
│   │       ├── clusters.ts       # CRUD /clusters
│   │       └── proxy.ts          # ALL /proxy/:clusterId/*
│   ├── prisma/
│   │   ├── schema.prisma         # Database schema
│   │   └── migrations/           # Database migrations
│   ├── package.json
│   └── tsconfig.json
│
├── web/                          # Frontend SPA
│   ├── src/
│   │   ├── main.tsx              # React entry point
│   │   ├── App.tsx               # Root component with routing
│   │   ├── pages/                # Page components
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── cluster/          # Cluster detail pages
│   │   ├── layouts/              # Layout components
│   │   ├── components/
│   │   │   ├── ui/               # shadcn/ui components
│   │   │   ├── cluster/          # Cluster-specific components
│   │   │   └── charts/           # ECharts visualizations
│   │   ├── hooks/                # Custom React hooks
│   │   ├── contexts/             # React contexts
│   │   ├── lib/                  # Utility functions
│   │   └── types/                # TypeScript types
│   ├── package.json
│   ├── vite.config.ts
│   └── vitest.config.ts
│
├── e2e/                          # End-to-end tests
│   ├── fixtures.ts               # Test fixtures and helpers
│   ├── auth.spec.ts
│   ├── cluster.spec.ts
│   ├── buckets.spec.ts
│   └── keys.spec.ts
│
├── package.json                  # Workspace configuration
├── pnpm-workspace.yaml
├── playwright.config.ts
├── prettier.config.cjs
└── garage-admin-v2.json          # Garage OpenAPI spec
```

---

## API Package

### Routes

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

See [Database Management](#database-management) section for the current schema.

### Key Files

- **`src/index.ts`** - Express app setup and route registration
- **`src/db.ts`** - Prisma client with LibSQL adapter
- **`src/encryption.ts`** - AES-256-GCM encrypt/decrypt functions
- **`src/middleware/auth.middleware.ts`** - JWT verification middleware
- **`src/routes/proxy.ts`** - Garage API proxy with credential decryption

---

## Web Package

### Routing Structure

```
/login                      → Login page
/                           → Dashboard (cluster list)
/clusters/:id               → Cluster detail (nested routes)
  /clusters/:id/            → Overview
  /clusters/:id/buckets     → Bucket list
  /clusters/:id/buckets/:bid → Bucket detail
  /clusters/:id/keys        → Key list
  /clusters/:id/keys/:kid   → Key detail
  /clusters/:id/nodes       → Node list
  /clusters/:id/nodes/:nid  → Node detail
  /clusters/:id/layout      → Layout manager
  /clusters/:id/tokens      → Admin token list
  /clusters/:id/blocks      → Block manager
  /clusters/:id/workers     → Worker manager
  /clusters/:id/metrics     → Prometheus metrics
  /clusters/:id/api         → API explorer
```

### Component Organization

```
components/
├── ui/                     # shadcn/ui primitives
│   ├── button.tsx
│   ├── dialog.tsx
│   ├── table.tsx
│   └── ...
├── cluster/                # Cluster feature components
│   ├── ConfirmDialog.tsx   # 3-tier confirmation dialog
│   ├── PageHeader.tsx      # Consistent page headers
│   ├── SecretReveal.tsx    # One-time secret display
│   ├── NodeSelector.tsx    # Node selection dropdown
│   └── JsonViewer.tsx      # JSON display component
└── charts/                 # Data visualization
    ├── ClusterHealthChart.tsx
    ├── CapacityGauge.tsx
    └── NodeStatusChart.tsx
```

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useClusters` | Cluster CRUD operations |
| `useClusterHealth` | Health and status queries |
| `useBuckets` | Bucket operations |
| `useKeys` | Access key operations |
| `useNodes` | Node info and operations |
| `useLayout` | Layout management |
| `useBlocks` | Block error management |
| `useWorkers` | Worker management |
| `useAdminTokens` | Admin token CRUD |
| `usePermissions` | Bucket-key permissions |

### API Client

The API client (`lib/api.ts`) provides:

- Axios instance with base URL configuration
- JWT token injection via interceptor
- Automatic redirect to login on 401/403
- `proxyPath(clusterId, path)` helper for Garage API calls

```typescript
// Example usage
import { api, proxyPath } from '@/lib/api';

// Direct API call
const clusters = await api.get('/clusters');

// Proxied Garage API call
const buckets = await api.get(proxyPath(clusterId, '/v2/ListBuckets'));
```

---

## Testing

### Unit Tests (Vitest)

```bash
# Run in watch mode
pnpm -C web test

# Run once
pnpm -C web test:run

# Run with coverage
pnpm -C web test:coverage
```

Unit tests are located alongside source files with `.test.ts` or `.test.tsx` extension.

**Test setup**: `web/src/test/setup.ts` configures jsdom environment and mocks.

### E2E Tests (Playwright)

```bash
# Run all E2E tests
npx playwright test

# Run with UI
npx playwright test --ui

# Run specific test file
npx playwright test e2e/auth.spec.ts

# View report
npx playwright show-report
```

**Configuration**: `playwright.config.ts`
- Browser: Chromium
- Base URL: `http://localhost:5173`
- Auto-starts dev server if not running

**Test fixtures**: `e2e/fixtures.ts` provides:
- `authenticatedPage` - Pre-logged-in page fixture
- `TEST_GARAGE_CLUSTER` - Test cluster credentials

---

## Database Management

### Quick Commands

```bash
pnpm -C api db:migrate   # Run migrations (dev)
pnpm -C api db:push      # Push schema changes (dev)
pnpm -C api db:seed      # Seed the database
pnpm -C api db:studio    # Open Prisma Studio GUI
pnpm -C api db:reset     # Reset database (WARNING: deletes all data)
```

### Initial Setup

```bash
# 1. Initialize database with schema
pnpm -C api db:push

# 2. (Optional) Run seed script
pnpm -C api db:seed
```

The seed script (`api/prisma/seed.ts`) is a placeholder that provides setup instructions. Clusters are added through the web UI, not seeded.

### Migrations

```bash
# Create a new migration
pnpm -C api npx prisma migrate dev --name <migration_name>

# Apply migrations (production)
pnpm -C api npx prisma migrate deploy

# Reset database (development only - deletes all data!)
pnpm -C api db:reset
```

### Prisma Studio

```bash
# Open database GUI
pnpm -C api db:studio
```

### Generate Client

```bash
# Regenerate Prisma client after schema changes
pnpm -C api npx prisma generate
```

### Schema

```prisma
model Cluster {
  id          String   @id @default(uuid())
  name        String
  endpoint    String
  adminToken  String   // AES-256-GCM encrypted
  metricToken String?  // AES-256-GCM encrypted (optional)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model AppSettings {
  key   String @id
  value String
}
```

---

## Code Style

### Formatting

- **Prettier** with 100-char line width, single quotes, trailing commas
- **EditorConfig** for consistent editor settings

```bash
# Format all files
pnpm format

# Check formatting
pnpm format:check
```

### Linting

- **ESLint 9** flat config with TypeScript support
- React Hooks and React Refresh plugins for frontend

```bash
# Lint all files
pnpm lint

# Auto-fix issues
pnpm lint:fix
```

### Type Checking

```bash
# Check API types
pnpm -C api typecheck

# Web types are checked during build
pnpm -C web build
```

### Conventions

- Use TypeScript strict mode
- Prefer named exports over default exports
- Use `@/` path alias for imports in web package
- Keep components focused and composable
- Extract business logic into custom hooks
- Use TanStack Query for all data fetching

---

## Common Tasks

### Adding a New Page

1. Create page component in `web/src/pages/`
2. Add route in `web/src/App.tsx`
3. Create any necessary hooks in `web/src/hooks/`
4. Add types in `web/src/types/garage.ts` if needed

### Adding a New API Endpoint

1. Create or update route handler in `api/src/routes/`
2. Register route in `api/src/index.ts`
3. Add Zod schema for request validation
4. Update frontend API calls as needed

### Adding a UI Component

1. For shadcn/ui components: `npx shadcn-ui@latest add <component>`
2. For custom components: create in `web/src/components/cluster/`
3. Export from `web/src/components/cluster/index.ts`

### Adding a New Garage API Integration

1. Check `garage-admin-v2.json` for endpoint specification
2. Add TypeScript types to `web/src/types/garage.ts`
3. Create or update hook in `web/src/hooks/`
4. Update relevant page components

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
pnpm -C api npx prisma migrate reset
```

**Port already in use**
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Kill process on port 5173
lsof -ti:5173 | xargs kill -9
```

**TypeScript errors after pulling changes**
```bash
# Regenerate types
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
4. Ensure all tests pass: `pnpm -C web test:run && npx playwright test`
5. Run linting: `pnpm lint`
6. Create a pull request with a clear description

### Commit Messages

Use conventional commit format:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks
