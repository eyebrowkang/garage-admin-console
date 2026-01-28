# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Garage Admin Console — a web-based administration interface for managing [Garage](https://garagehq.deuxfleurs.fr/) object storage clusters.
Designed for internal network deployment with lightweight authentication and encrypted credential storage.

## Commands

```bash
pnpm install              # Install dependencies (run pnpm approve-builds if native builds are blocked)
pnpm dev                  # Start both API (port 3001) and web (Vite dev server) concurrently
pnpm build                # Build both packages (api then web)
pnpm lint                 # Lint both packages
pnpm lint:fix             # Auto-fix lint issues
pnpm format               # Format all code with Prettier
pnpm format:check         # Check formatting without writing

# Run commands for a single package:
pnpm -C api <script>      # e.g. pnpm -C api dev, pnpm -C api typecheck
pnpm -C web <script>      # e.g. pnpm -C web dev, pnpm -C web build

# Type checking (api only):
pnpm -C api typecheck     # tsc --noEmit
```

No test framework is configured. The API test script is a placeholder.

## Architecture

**Monorepo** (pnpm workspace) with two packages:

- **`api/`** — Backend-For-Frontend (BFF) service: Express 5, Prisma (SQLite via LibSQL), TypeScript
- **`web/`** — Frontend SPA: React 19, Vite, TanStack React Query, Tailwind CSS, TypeScript

### Data Flow (BFF Proxy Pattern)

The frontend never talks to Garage clusters directly. All Garage API calls go through the BFF proxy:

```
Browser → /proxy/:clusterId/* → BFF decrypts stored admin token → forwards to Garage cluster endpoint
```

- **Auth**: Single admin password → JWT (24h, stored in localStorage). Set via `ADMIN_PASSWORD` env var.
- **Credential storage**: Garage admin tokens are AES-256-GCM encrypted in SQLite. Decrypted only when proxying.
- **Vite dev proxy**: Routes `/auth`, `/clusters`, `/proxy`, `/health`, `/metrics`, `/check` to `localhost:3001`. The `/api` prefix is stripped via rewrite.

### API Routes (`api/src/routes/`)

| Route                     | Auth | Purpose                         |
| ------------------------- | ---- | ------------------------------- |
| `POST /auth/login`        | No   | Returns JWT                     |
| `GET /health`             | No   | Health check                    |
| `GET /clusters`           | JWT  | List clusters (tokens excluded) |
| `POST /clusters`          | JWT  | Add cluster                     |
| `DELETE /clusters/:id`    | JWT  | Remove cluster                  |
| `ALL /proxy/:clusterId/*` | JWT  | Proxy to Garage admin API       |

### Frontend Structure (`web/src/`)

- **Routing** (React Router v7): `/login`, `/` (Dashboard), `/clusters/:id` (ClusterDetail with tabs)
- **Pages**: `Login`, `Dashboard` (cluster list/management), `ClusterDetail` (tabbed: Overview, Buckets, Keys, Nodes, Layout, API Explorer)
- **API client** (`lib/api.ts`): Axios instance with JWT interceptor; 401/403 → redirect to login
- **UI**: shadcn/ui components (`components/ui/`) built on Radix UI primitives, styled with Tailwind
- **Path alias**: `@` → `web/src/`

### Database Schema (`api/prisma/schema.prisma`)

Two models: `Cluster` (id, name, endpoint, region?, adminToken encrypted, timestamps) and `AppSettings` (key-value).

## Key Files

- `garage-admin-v2.json` — Garage OpenAPI spec (reference for all admin API endpoints)
- `api/src/encryption.ts` — AES-256-GCM encrypt/decrypt for Garage tokens
- `api/src/middleware/auth.middleware.ts` — JWT verification middleware
- `api/src/db.ts` — Prisma client initialization with LibSQL adapter
- `web/src/types/garage.ts` — TypeScript interfaces for Garage API responses
- `web/src/lib/api.ts` — Axios instance, interceptors, `proxyPath()` helper

## Environment Variables (api/.env)

```
DATABASE_URL="file:./dev.db"
JWT_SECRET="..."
ENCRYPTION_KEY="..."          # Must be exactly 32 bytes
PORT=3001
ADMIN_PASSWORD="..."
```

## Code Style

- Prettier: 100-char width, single quotes, trailing commas, semicolons, 2-space indent
- ESLint 9 flat config with TypeScript rules; React Hooks + React Refresh plugins on frontend
- Both packages use ES modules and strict TypeScript
