# AGENTS.md

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

## Project Overview

Garage Admin Console — a web-based administration interface for managing [Garage](https://garagehq.deuxfleurs.fr/) object storage clusters. Includes a companion S3 Browser app for managing objects in S3-compatible storage buckets.

## Commands

```bash
pnpm install              # Install dependencies (run pnpm approve-builds if native builds are blocked)
pnpm dev                  # Start all apps (admin + s3-browser) concurrently
pnpm dev:admin            # Start admin API (port 3001) and web (port 5173) only
pnpm dev:s3               # Start s3-browser API (port 3002) and web (port 5174) only
pnpm build                # Build all packages
pnpm lint                 # Lint all packages
pnpm lint:fix             # Auto-fix lint issues
pnpm format               # Format all code with Prettier
pnpm format:check         # Check formatting without writing
pnpm typecheck            # Type-check all packages
pnpm test                 # Run all tests

# Run commands for a single package:
pnpm -C apps/admin/api <script>       # e.g. pnpm -C apps/admin/api dev
pnpm -C apps/admin/web <script>       # e.g. pnpm -C apps/admin/web build
pnpm -C apps/s3-browser/api <script>  # e.g. pnpm -C apps/s3-browser/api dev
pnpm -C apps/s3-browser/web <script>  # e.g. pnpm -C apps/s3-browser/web build

# Testing:
npx playwright test       # Run E2E tests (Playwright)
```

## Architecture

**Monorepo** (pnpm workspace) with apps and shared packages:

### Apps

- **`apps/admin/api/`** — Admin BFF service: Express 5, Drizzle ORM (SQLite via LibSQL), TypeScript
- **`apps/admin/web/`** — Admin frontend SPA: React 19, Vite, TanStack React Query, Tailwind CSS, TypeScript (MF host)
- **`apps/s3-browser/api/`** — S3 Browser BFF service: Express 5, TypeScript
- **`apps/s3-browser/web/`** — S3 Browser frontend SPA: React 19, Vite, Tailwind CSS, TypeScript (MF remote)

### Shared Packages

- **`packages/tsconfig/`** — Shared TypeScript configs (base, react, node)
- **`packages/ui/`** — Shared UI components (cn(), Button, Card) with shadcn/ui
- **`packages/auth/`** — Shared JWT auth middleware factory

### Module Federation

Admin web (host) loads components from s3-browser web (remote) via `@module-federation/vite`. Shared singletons: react, react-dom, react-router-dom, @tanstack/react-query. The s3-browser exposes `ObjectBrowser`, `BucketExplorer`, and `S3EmbedProvider` components.

### Data Flow (BFF Proxy Pattern)

The frontend never talks to Garage clusters directly. All Garage API calls go through the BFF proxy:

```
Browser → /proxy/:clusterId/* → BFF decrypts stored admin token → forwards to Garage cluster endpoint
```

### Admin API Routes (`apps/admin/api/src/routes/`)

Routes are registered in `apps/admin/api/src/app.ts`.

| Route                     | Auth | Purpose                         |
| ------------------------- | ---- | ------------------------------- |
| `POST /auth/login`        | No   | Returns JWT                     |
| `GET /health`             | No   | Health check                    |
| `GET /clusters`           | JWT  | List clusters (tokens excluded) |
| `POST /clusters`          | JWT  | Add cluster                     |
| `PUT /clusters/:id`       | JWT  | Update cluster                  |
| `DELETE /clusters/:id`    | JWT  | Remove cluster                  |
| `ALL /proxy/:clusterId/*` | JWT  | Proxy to Garage admin API       |

### Frontend Structure (`apps/admin/web/src/`)

- **Routing** (React Router v7, defined in `App.tsx`): `/login`, `/` (Dashboard), `/clusters/:id` (ClusterDetail with sidebar navigation), `/s3-test` (MF test route)
- **Pages**: `Login`, `Dashboard` (cluster list/management), Cluster pages (Overview, Buckets, Keys, Nodes, Layout, Admin Tokens, Workers, Blocks, Metrics)
- **API client** (`lib/api.ts`): Axios instance with JWT interceptor; 401/403 → redirect to login
- **UI**: shadcn/ui components (`components/ui/`) built on Radix UI primitives, styled with Tailwind
- **Path alias**: `@` → `apps/admin/web/src/`

### Database Schema (`apps/admin/api/src/db/schema.ts`)

Two tables defined with Drizzle ORM: `Cluster` (id, name, endpoint, adminToken encrypted, metricToken encrypted optional, timestamps) and `AppSettings` (key-value). Migrations are in `apps/admin/api/drizzle/` and run automatically on startup.

## Frontend UX/UI design principles and approach

### UX

The overall approach progresses from simple to complex, layer by layer.

The outermost layer is the Dashboard page, which displays information for all clusters.
There will be multiple clusters here, usually independent of each other, so it should present key cluster-level information, such as the number of nodes, whether the cluster is healthy, and whether storage capacity is under pressure.

After clicking on a cluster, you enter the operation page for a single cluster.
The overall layout has a function selection area on the left and a function display/operation area on the right.
The first and default function is the Overview page, which displays information about a single cluster.
The information here should be more detailed than on the Dashboard, presenting an overview of a single cluster, including health status, layout information, statistical information, and so on.

Next are seven major functional modules: Buckets, Access Keys, Layout, Nodes, Admin Tokens, Workers, and Blocks.
Each module continues to follow the logic of progressing from simple to complex, layer by layer. For example, in Buckets, the main page displays a list that only shows the primary information about buckets, along with functions to create and delete them.
After clicking on a bucket, you enter the detail page, where you can see more information and perform more operations, such as Aliases and Website Access.

### UI

The theme color is orange `rgb(255, 148, 41)`. The logo comes from Garage official assets and is located in the `apps/admin/web/public` directory.
The overall style is light-themed, and switching to a dark theme is not supported for now.
The page should not use too many colors; keep the style simple.
Red represents errors, green represents health, purple represents warnings.
Together with the theme color, there should be a total of four colors; try not to add additional colors.
The style should remain consistent, especially across pages at the same hierarchy level—their styles or style direction should be as consistent as possible.
Pages at different hierarchy levels should have slight differences.

## Key Files

- `apps/admin/web/public/garage-admin-v2.json` — Garage OpenAPI spec (reference for all admin API endpoints)
- `apps/admin/api/src/app.ts` — Express app setup and route registration
- `apps/admin/api/src/encryption.ts` — AES-256-GCM encrypt/decrypt for Garage tokens
- `apps/admin/api/src/middleware/auth.middleware.ts` — JWT verification middleware
- `apps/admin/api/src/db/index.ts` — Drizzle client initialization with LibSQL
- `apps/admin/api/src/db/schema.ts` — Drizzle table definitions
- `apps/admin/api/src/db/migrate.ts` — Programmatic migration runner
- `apps/admin/web/src/types/garage.ts` — TypeScript interfaces for Garage API responses
- `apps/admin/web/src/lib/api.ts` — Axios instance, interceptors, `proxyPath()` helper
- `packages/auth/src/middleware.ts` — Configurable JWT auth middleware factory
- `packages/ui/src/index.ts` — Shared UI components barrel export

## Docker

Three deployment modes via Dockerfiles in the `docker/` directory:

- **`docker/admin.Dockerfile`** — Standalone admin console
- **`docker/s3-browser.Dockerfile`** — Standalone S3 browser
- **`docker/combined.Dockerfile`** — Both apps in one image

Key production environment variables: `DATA_DIR` (database directory, default `/data`), `STATIC_DIR` (frontend files, default `/app/static`). See `docker-compose.yml` for a complete example.

## Environment Variables

- Admin API: see `apps/admin/api/.env.example`. Validation in `apps/admin/api/src/config/env.ts`.
- S3 Browser API: see `apps/s3-browser/api/.env.example`. Validation in `apps/s3-browser/api/src/config/env.ts`.

## Git Workflow

- **Never commit directly to `main`.** Always create a feature branch and open a pull request.
- All commit messages and PR titles (for squash merges) must follow [Conventional Commits](https://www.conventionalcommits.org/) format (`type: description`). This is required for Release Please to generate changelogs and release PRs.

## Versioning

The major version tracks the upstream Garage Admin API version (e.g. API v2 → project `2.x.x`). Major bumps only happen when migrating to a new Garage API version. Within a major version: `fix:` → patch, `feat:` / significant `refactor:` → minor.

## Code Style

- Prettier: 100-char width, single quotes, trailing commas, semicolons, 2-space indent
- ESLint 9 flat config with TypeScript rules; React Hooks + React Refresh plugins on frontend
- All packages use ES modules and strict TypeScript
