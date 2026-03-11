# Monorepo Restructure & S3 Browser Integration

**Date:** 2026-03-10
**Status:** Approved

## Goal

Restructure the Garage Admin Console into a monorepo that hosts two sibling applications:

- **Project A (admin):** Existing Garage cluster management console
- **Project B (s3-browser):** General-purpose S3-compatible object management console

Both can be deployed independently or together. When deployed together, Project A embeds Project B's components via Module Federation for seamless in-app object browsing.

## Constraints

- Repository name stays `garage-admin-console`
- npm package scope: `@garage-admin/*` (workspace-internal only, not published to npm)
- Project B is S3-generic, not Garage-specific (the `@garage-admin` scope is organizational, not a branding constraint)
- Existing functionality must not break after restructure
- Incremental conventional commits throughout

## Directory Structure

```
garage-admin-console/
├── apps/
│   ├── admin/                           # Project A
│   │   ├── api/                         # Express BFF — Admin API proxy
│   │   │   ├── src/
│   │   │   ├── drizzle/
│   │   │   └── package.json             # @garage-admin/admin-api
│   │   └── web/                         # React SPA — MF Host
│   │       ├── src/
│   │       ├── public/
│   │       ├── vite.config.ts
│   │       └── package.json             # @garage-admin/admin-web
│   │
│   └── s3-browser/                      # Project B
│       ├── api/                         # Express BFF — S3 signing proxy
│       │   ├── src/
│       │   └── package.json             # @garage-admin/s3-api
│       └── web/                         # React SPA — MF Remote
│           ├── src/
│           ├── vite.config.ts
│           └── package.json             # @garage-admin/s3-web
│
├── packages/
│   ├── ui/                              # Shared UI components & theme
│   │   └── package.json                 # @garage-admin/ui
│   ├── auth/                            # Shared auth (JWT middleware, types)
│   │   └── package.json                 # @garage-admin/auth
│   └── tsconfig/                        # Shared TypeScript configs
│       └── package.json                 # @garage-admin/tsconfig
│
├── docker/
│   ├── admin.Dockerfile                 # Standalone admin console
│   ├── s3-browser.Dockerfile            # Standalone S3 browser
│   └── combined.Dockerfile              # Both in one image
│
├── docs/
├── pnpm-workspace.yaml
├── package.json
└── CLAUDE.md
```

## Module Federation

**Tooling:** `@module-federation/vite`

**Project B (Remote)** exposes components:

| Export              | Purpose                          |
| ------------------- | -------------------------------- |
| `./ObjectBrowser`   | Object list/management for one bucket |
| `./BucketExplorer`  | Bucket list + object browsing    |
| `./S3Provider`      | S3 context provider              |

**Project A (Host)** consumes them:

```tsx
const ObjectBrowser = React.lazy(() => import('s3_browser/ObjectBrowser'));

<Suspense fallback={<Loading />}>
  <ObjectBrowser bucket={bucketName} />
</Suspense>
```

**Shared singletons:** `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`

Components run inside Project A's React tree, sharing router, query client, and theme.

## BFF Architecture

### S3 Auth vs Admin Auth

- Admin API: Bearer token (existing proxy pattern)
- S3 API: AWS Signature V4 (access key + secret key)

These are fundamentally different protocols and require separate proxy implementations.

### S3 BFF Routes

**Standalone mode** — Project B manages its own connections:

| Route                          | Auth       | Purpose               |
| ------------------------------ | ---------- | --------------------- |
| `POST /api/connections`        | B's own JWT | Save S3 connection   |
| `GET /api/connections`         | B's own JWT | List connections     |
| `DELETE /api/connections/:id`  | B's own JWT | Remove connection    |
| `ALL /api/s3/:connectionId/*`  | B's own JWT | Proxy S3 requests    |

**Embedded mode (combined deployment)** — credentials from Project A:

| Route                                | Auth    | Purpose              |
| ------------------------------------ | ------- | -------------------- |
| `ALL /api/s3-proxy/:clusterId/:keyId/*` | A's JWT | Proxy S3 via admin key |

In combined deployment, Project A's Express mounts the S3 router:

```ts
import { createS3Router } from '@garage-admin/s3-api/router';

app.use('/api/s3-proxy', authenticateToken, createS3Router({
  credentialProvider: async (clusterId, keyId) => {
    // Fetch key secret via Garage Admin API
  }
}));
```

## Shared Packages

### @garage-admin/ui

Extracted from existing `web/src/components/ui/`. Contains:

- shadcn/ui primitives (Button, Card, Dialog, etc.)
- Theme tokens (orange primary, light theme)
- Layout primitives

### @garage-admin/auth

Extracted from existing auth middleware. Contains:

- JWT creation/verification utilities (secret is injected, not read from env)
- `authenticateToken` Express middleware factory (accepts config with secret)
- Auth-related TypeScript types

Both Project A and Project B use this package with their own JWT secrets. In standalone mode, Project B has its own `JWT_SECRET` env var. In combined deployment, a single secret is shared since Project A's Express handles all auth.

### @garage-admin/tsconfig

Shared TypeScript config base files:

- `base.json` — strict mode, common settings
- `react.json` — extends base + JSX, DOM lib
- `node.json` — extends base + Node types

## Deployment

| Scenario           | Image                     | What runs                              |
| ------------------ | ------------------------- | -------------------------------------- |
| Admin only         | `admin.Dockerfile`        | Admin BFF + Admin SPA                  |
| S3 Browser only    | `s3-browser.Dockerfile`   | S3 BFF + S3 SPA (full standalone UI)   |
| Combined           | `combined.Dockerfile`     | Admin BFF (w/ S3 routes) + Admin SPA + S3 remote assets |

Combined deployment serves S3 Browser's `remoteEntry.js` from the same origin under `/s3-browser/`, avoiding CORS issues.

### Combined Deployment Route Priority

The Express server in combined mode must handle routes in this order to avoid SPA catch-all conflicts (ref: commit `decf3b9`):

1. `/api/*` — Admin BFF routes (auth, clusters, proxy, health)
2. `/api/s3-proxy/*` — S3 proxy routes (mounted by admin BFF)
3. `/s3-browser/*` — Static files for S3 remote (remoteEntry.js, assets)
4. `/*` — Admin SPA static files + SPA fallback (index.html for unmatched GET)

The SPA fallback must be registered last and must NOT match `/api/*` or `/s3-browser/*` prefixes.

### Environment Variables

| Variable | Admin Only | S3 Browser Only | Combined |
| --- | --- | --- | --- |
| `JWT_SECRET` | Required | Required | Required (shared) |
| `ENCRYPTION_KEY` | Required | Required (for stored S3 secrets) | Required (shared) |
| `ADMIN_PASSWORD` | Required | Required (B's own admin) | Required (A's admin) |
| `DATA_DIR` | Required | Required | Required (shared) |
| `STATIC_DIR` | Set by Dockerfile | Set by Dockerfile | Set by Dockerfile |
| `S3_BROWSER_STATIC_DIR` | N/A | N/A | Set by Dockerfile |
| `PORT` | 3001 | 3002 (default) | 3001 |

## Embedded Mode Detection

Project B's frontend detects its runtime context:

**Mechanism:** The host app (Project A) wraps the remote component in a React context provider that supplies S3 config. The remote component checks for this context at mount time.

```tsx
// Shared contract (in @garage-admin/s3-api or a types package)
interface S3EmbedConfig {
  apiBase: string;       // e.g. "/api/s3-proxy/cluster123/key456"
  bucket?: string;       // pre-selected bucket
  readonly?: boolean;    // restrict to read-only operations
}

// Project A (host) provides the context:
<S3EmbedProvider config={{ apiBase, bucket }}>
  <ObjectBrowser />
</S3EmbedProvider>

// Project B (remote) checks for context:
function ObjectBrowser() {
  const embedConfig = useS3EmbedContext(); // returns null when standalone
  const isEmbedded = embedConfig !== null;
  // ...
}
```

When running standalone, no provider wraps the component, so `useS3EmbedContext()` returns `null` and the full UI is shown.

Standalone mode: full SPA with connection management, bucket list, object browsing.
Embedded mode: only the object browser component, receiving config from the host.

## Scope for Initial Implementation

This phase focuses on scaffolding only:

1. Restructure monorepo (move existing code into `apps/admin/`)
2. Create shared packages with minimal content
3. Scaffold `s3-browser` with placeholder pages
4. Configure Module Federation (host + remote)
5. Verify both standalone and embedded modes render
6. Set up Docker files (build verification, not full deployment testing)
7. Ensure all existing functionality works after restructure

S3 BFF implementation, actual S3 operations, and full embedded mode credential flow are deferred to a later phase.

### Acceptance Criteria

- [ ] `pnpm dev` starts all four dev servers (admin-api, admin-web, s3-api, s3-web)
- [ ] Admin console works identically to before restructure (all existing pages functional)
- [ ] S3 Browser standalone serves a placeholder page at its own port
- [ ] Admin console (host) loads a placeholder component from S3 Browser (remote) via Module Federation
- [ ] `pnpm build` succeeds for all packages
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] Docker builds succeed for all three Dockerfiles

## Versioning & Release

The project continues to use a **single version** for the entire repository. Release Please stays on `simple` release type at the root level. Rationale: the two apps are tightly coupled (shared packages, combined deployment), and independent versioning adds overhead without clear benefit at this stage.

If the S3 Browser later needs independent releases, the Release Please config can be migrated to `node` type with per-package entries. This is a future concern.

## CI/CD Updates

The CI and release workflows need path updates after restructure:

| Current | After |
| --- | --- |
| `pnpm -C api typecheck` | `pnpm -C apps/admin/api typecheck` |
| `pnpm -C web build` | `pnpm -C apps/admin/web build` |
| `pnpm -C api test:run` | `pnpm -C apps/admin/api test:run` |
| `pnpm -C web test:run` | `pnpm -C apps/admin/web test:run` |

New steps to add: typecheck/build/test for `apps/s3-browser/api` and `apps/s3-browser/web`.

The root `Dockerfile` moves to `docker/admin.Dockerfile` (existing functionality). The release workflow's Docker build context and Dockerfile path need corresponding updates. For the initial scaffolding phase, only `admin.Dockerfile` needs to be fully functional; the other two Dockerfiles are created but not integrated into CI.

## Testing Infrastructure

The Playwright E2E config at the project root needs updating:
- `testDir` stays at `./e2e` (root-level E2E tests cover the deployed application)
- `webServer` command changes to start the appropriate dev servers
- Existing E2E tests should pass unchanged after restructure

Root-level Prettier and ESLint configs remain at the repo root and apply to all packages. Per-package ESLint configs extend the root where needed (existing pattern preserved).
