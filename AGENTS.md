# AGENTS.md

Agent-oriented map of this repo. Deep references live in [`docs/`](./docs/) —
this file is the orientation layer plus the conventions you must not get wrong.

Always use Context7 MCP when you need library/API documentation, code generation, or setup/configuration steps, without me having to explicitly ask.

## Project Overview

A pnpm workspace shipping **two products that share a design system and a Bucket Backend API surface**:

- **Garage Admin Console** (production) — web interface for managing [Garage](https://garagehq.deuxfleurs.fr/) object storage clusters. Tracks Garage Admin API v2.
- **S3 Browser** — generic S3-protocol file browser. Runs standalone, AND can be **embedded into the Admin Console's bucket detail page via Module Federation 2.0** so users manage objects without leaving the cluster UI.

## Repository Layout

```
garage-admin-console/                     # monorepo root
├── garage-admin-console/{api,web}        # Admin Console — BFF (Express) + SPA (Vite, MF Host)
├── s3-browser/{api,web}                  # S3 Browser — BFF + SPA (Rsbuild, MF Remote)
├── packages/
│   ├── tokens, ui, web-shared            # shared frontend: design tokens, UI primitives, api/query/format logic
│   ├── crypto, server-config             # shared backend: AES-256-GCM, env/auth/db helpers (both BFFs)
│   ├── bucket-api-server                 # shared Express router for the Bucket Backend API
│   └── bucket-api-contract-tests         # Bucket Backend API regression suite
├── docs/                                 # architecture, development, bucket-api, testing, deployment
├── designs/                              # historical design notes (local-only; gitignored, not in the repo)
├── e2e/  screenshots/  docker/
```

## Where things are documented

| Topic | Doc |
| --- | --- |
| System design, BFFs, Module Federation, DB schemas | [docs/architecture.md](./docs/architecture.md) |
| Setup, env vars, dev servers, common tasks, troubleshooting | [docs/development.md](./docs/development.md) |
| The shared Bucket Backend API contract + conformance suite | [docs/bucket-api.md](./docs/bucket-api.md) |
| Test strategy, conventions, coverage, offline vs. live | [docs/testing.md](./docs/testing.md) |
| Docker images, production env vars | [docs/deployment.md](./docs/deployment.md) |
| PWA: manifests, service-worker caching contract, icons | [docs/pwa.md](./docs/pwa.md) |
| Branching, Conventional Commits, versioning, code style | [CONTRIBUTING.md](./CONTRIBUTING.md) |

## Commands

```bash
pnpm install                                   # install all workspaces
pnpm dev                                       # Admin BFF :3001 + Vite :5173
pnpm -C s3-browser/api dev                     # S3 Browser BFF :3002
pnpm -C s3-browser/web dev                     # S3 Browser web :5174 (MF Remote)
pnpm build                                      # shared packages + Admin api + web
pnpm lint  ·  pnpm format[:check]  ·  pnpm typecheck
pnpm test                                       # full offline suite across every workspace
pnpm test:coverage                              # aggregated v8 coverage (informational)
pnpm e2e                                         # Playwright (Admin Console; needs a live backend)
pnpm -C packages/bucket-api-contract-tests test:run   # contract suite (env-gated)
```

Per workspace: `pnpm -C <workspace> <script>`. The four-process embedded-MF dev
workflow is in [docs/development.md](./docs/development.md#developing-the-embedded-filebrowser).

## Conventions you must not get wrong

- **Keep both web apps aligned — don't fork them.** New shared UI goes in `@garage/ui`, new shared non-UI logic in `@garage/web-shared`; never copy a util/component into both apps. Both `web` apps extend the repo-root [`tsconfig.base.json`](./tsconfig.base.json) and [`eslint.config.base.js`](./eslint.config.base.js). `react-refresh` lint stays admin-only (the S3 Browser remote co-locates non-component exports in its MF entries).
- **Module Federation: the Admin host owns federation via `@module-federation/runtime`.** Do NOT add `@module-federation/vite` to the host — it trips React 19's two-copies "Invalid hook call" guard. See [docs/architecture.md](./docs/architecture.md#module-federation).
- **The Bucket Backend API is shared in `@garage/bucket-api-server`.** Change it there once; cover it in `bucket-api-contract-tests` so both BFFs stay in sync. See [docs/bucket-api.md](./docs/bucket-api.md).
- **No `@aws-sdk/*` in any frontend.** The federated `FileBrowser` talks only to the Bucket Backend API and reads credentials from props, never from `localStorage`/`window`/env.
- **UX/UI:** light theme only; **four colors only** — theme orange `rgb(255,148,41)` · red (errors) · green (health) · purple (warnings). List pages stay light, detail pages go deep.
- **Git:** never commit directly to `main`; branch + PR. All commit messages / squash-merge PR titles follow [Conventional Commits](https://www.conventionalcommits.org/) (required by Release Please).
- **Versioning:** release-please manifest mode with **independent per-product versions** — the Admin Console (root component, `vX.Y.Z`) major tracks the Garage Admin API version (v2 → `2.x.x`); the S3 Browser (`s3-browser-vX.Y.Z`) is its own line. Within a major, `fix:` → patch, `feat:`/significant `refactor:` → minor.
- **Code style:** Prettier (100-char, single quotes, trailing commas, semicolons, 2-space), ESLint 9 flat config, strict TypeScript, ES modules everywhere.

## Key Files

**Shared:** [`packages/bucket-api-server/src/router.ts`](./packages/bucket-api-server/src/router.ts) (the `createBucketRouter` factory) · [`packages/crypto/src/index.ts`](./packages/crypto/src/index.ts) · [`packages/ui/src/index.ts`](./packages/ui/src/index.ts) · [`packages/web-shared/src/index.ts`](./packages/web-shared/src/index.ts)

**Admin BFF:** [`api/src/app.ts`](./garage-admin-console/api/src/app.ts) · [`api/src/lib/garage-keys.ts`](./garage-admin-console/api/src/lib/garage-keys.ts) (per-bucket S3 key manager) · [`api/src/routes/buckets.ts`](./garage-admin-console/api/src/routes/buckets.ts) · [`api/src/db/schema.ts`](./garage-admin-console/api/src/db/schema.ts)

**Admin web:** [`web/src/mf-init.ts`](./garage-admin-console/web/src/mf-init.ts) (explicit MF init) · [`web/src/components/cluster/BucketObjectBrowser.tsx`](./garage-admin-console/web/src/components/cluster/BucketObjectBrowser.tsx) (embedded FileBrowser wrapper) · [`web/src/lib/api.ts`](./garage-admin-console/web/src/lib/api.ts) · [`web/src/types/s3-browser.d.ts`](./garage-admin-console/web/src/types/s3-browser.d.ts) (`FileBrowserProps` shim)

**S3 Browser:** [`s3-browser/api/src/routes/buckets.ts`](./s3-browser/api/src/routes/buckets.ts) · [`s3-browser/web/rsbuild.config.ts`](./s3-browser/web/rsbuild.config.ts) (MF Remote config) · [`s3-browser/web/src/file-browser/FileBrowser.tsx`](./s3-browser/web/src/file-browser/FileBrowser.tsx) (the federated surface) · [`s3-browser/web/src/export-file-browser.tsx`](./s3-browser/web/src/export-file-browser.tsx)

**Garage spec:** [`garage-admin-console/web/public/garage-admin-v2.json`](./garage-admin-console/web/public/garage-admin-v2.json) (OpenAPI).
