# Development

Local setup and day-to-day workflows. For how the pieces fit together see
[architecture.md](./architecture.md); for the contribution process (branching,
commits, versioning) see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Prerequisites

- **Node.js** 24.x or later
- **pnpm** 10.x or later

## Initial setup

```bash
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

pnpm install
pnpm approve-builds        # if pnpm blocks native builds (bcrypt, sqlite3, …)

cp garage-admin-console/api/.env.example garage-admin-console/api/.env
cp s3-browser/api/.env.example s3-browser/api/.env   # optional, only for S3 Browser

pnpm dev                   # Admin api :3001 + web :5173 (in parallel)
```

Databases auto-migrate on startup. `JWT_SECRET`, `ENCRYPTION_KEY` (exactly 32
bytes), and `ADMIN_PASSWORD` are required for each BFF — they refuse to start
without them.

## Environment variables

### Admin BFF (`garage-admin-console/api/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `JWT_SECRET` | Yes | Secret for JWT signing (random 32+ char string) |
| `ENCRYPTION_KEY` | Yes | AES-256 key (exactly 32 bytes) |
| `ADMIN_PASSWORD` | Yes | Console login password |
| `PORT` | No | API port (default `3001`) |
| `LOG_LEVEL` | No | `fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent` (default `info`) |
| `MORGAN_FORMAT` | No | HTTP log format for morgan, or `off` to disable |
| `DATA_DIR` | No | Directory for the SQLite DB (default: cwd in dev, `/data` in Docker) |

Validation lives in [`src/config/env.ts`](../garage-admin-console/api/src/config/env.ts).

### Admin web (`garage-admin-console/web/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_S3_BROWSER_MF_URL` | No | URL of the s3-browser/web MF manifest. In dev, defaults to the current hostname on port `5174`; set it at build time for production. Unset/unreachable → the embedded browser shows a friendly fallback. |

### S3 Browser BFF (`s3-browser/api/.env`)

Same shape as the Admin BFF — `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD`
required; `PORT` defaults to `3002`. The two BFFs do not share secrets by default.

## Dev servers

```bash
pnpm dev                                # Admin api :3001 + web :5173

pnpm -C garage-admin-console/api dev    # Admin BFF only
pnpm -C garage-admin-console/web dev    # Admin web only
pnpm -C s3-browser/api dev              # S3 Browser BFF :3002
pnpm -C s3-browser/web dev              # S3 Browser web :5174 (MF remote)
```

Vite (Admin) and Rsbuild (S3 Browser) proxy `/api/*` to their respective BFFs.

## Developing the embedded FileBrowser

To work on the federated `FileBrowser` *inside* the Admin Console bucket detail
page, run all four processes (three terminals):

```bash
pnpm dev                        # T1 — Admin BFF :3001 + Vite host :5173
pnpm -C s3-browser/api dev      # T2 — S3 Browser BFF :3002
pnpm -C s3-browser/web dev      # T3 — S3 Browser web :5174 (serves /remoteEntry.js)
```

The host's `mf-init.ts` auto-derives `http://<hostname>:5174/mf-manifest.json`
when `VITE_S3_BROWSER_MF_URL` is unset, so it picks up the live remote from T3.
Then add a Garage cluster with `s3Endpoint` set (e.g. `http://localhost:3900`)
and open any bucket — `BucketObjectBrowser` renders the federated `<FileBrowser/>`.

Hot reload: changes under `s3-browser/web/src/` re-export the remote (a host page
refresh picks up the new bundle); changes to the host's `BucketObjectBrowser.tsx`
update via Vite HMR directly.

> `s3-browser/web/rsbuild.config.ts` sets `dev.assetPrefix: '/'` — required
> because the SPA fallback (`historyApiFallback: true`) is active. Without an
> absolute asset prefix, a deep URL like `/connections/abc` would resolve script
> tags to `/connections/static/...`, which the fallback returns as HTML and
> breaks the page.

## Common tasks

**Add a page (Admin):** component under `garage-admin-console/web/src/pages/`
(or `pages/cluster/`), route in `App.tsx`, hooks in `src/hooks/`, types in
`src/types/garage.ts`.

**Add a view (S3 Browser):** component under `s3-browser/web/src/...`, wire it
through `App.tsx`'s `<Routes>`.

**Add an API endpoint:** add/update a handler in the BFF's `src/routes/`,
register it in that BFF's `src/app.ts`, add a Zod schema, update frontend hooks.

**Extend the Bucket Backend API:** the shared logic lives in
`@garage/bucket-api-server`, so a change is usually one edit there plus the
contract tests — see [bucket-api.md](./bucket-api.md#extending-the-api).

**Add a UI primitive:** add it under `packages/ui/src/components/`, export from
`packages/ui/src/index.ts`, rebuild (`pnpm -F @garage/ui build`), then import via
`@garage/ui`. Do NOT add shadcn primitives directly into a web app's source tree.

## Database management

```bash
pnpm -C garage-admin-console/api db:generate   # create migration from schema diff
pnpm -C garage-admin-console/api db:push       # direct push (dev only)
pnpm -C garage-admin-console/api db:studio     # Drizzle Studio GUI
# same scripts exist on s3-browser/api
```

Schema workflow:

1. Edit the relevant `src/db/schema.ts`.
2. `pnpm -C <bff> db:generate --name=<description>`.
3. Commit the generated `drizzle/*.sql` + `meta/*.json`.
4. Migrations apply automatically on the next BFF start via `runMigrations()`.
   No separate migration step in Docker or CI.

`db:push` is fine for local prototyping; never use it on production data.

## Building

```bash
pnpm build                       # shared packages + Admin api + Admin web
pnpm -C s3-browser/api build     # S3 Browser BFF
pnpm -C s3-browser/web build     # S3 Browser web (emits the MF manifest)
```

## Troubleshooting

**`pnpm install` fails with native module errors** → `pnpm approve-builds && pnpm install`.

**Port already in use** → `lsof -ti:3001 | xargs kill -9` (3001 Admin BFF, 5173
Admin web, 3002 S3 Browser BFF, 5174 S3 Browser web).

**TypeScript errors after pulling** → `pnpm install && pnpm -F @garage/ui build && pnpm -C garage-admin-console/web build`.

**Embedded FileBrowser shows "S3 endpoint not configured"** → the cluster row's
`s3Endpoint` is null. Edit the cluster and add it (Garage's default S3 port is `:3900`).

**Embedded FileBrowser shows "S3 Browser unavailable — Retry"** → the MF manifest
is unreachable. Check `VITE_S3_BROWSER_MF_URL`, and that the S3 Browser web dev
server is running (`--host 0.0.0.0` when testing from another LAN host).

**"Invalid hook call" inside the federated FileBrowser** → two React copies. The
Admin host MUST own MF via `src/mf-init.ts` and load via `mfInstance.loadRemote(...)`.
Do NOT add `@module-federation/vite` to the host's plugin list (see
[architecture.md](./architecture.md#module-federation)).

**Debug mode:**

```bash
LOG_LEVEL=debug MORGAN_FORMAT=dev pnpm -C garage-admin-console/api dev   # BFF verbose
DEBUG=vite:* pnpm -C garage-admin-console/web dev                        # Vite verbose
```
