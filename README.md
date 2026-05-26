# Garage Admin Console

[English](./README.md) | [中文](./README_zh.md)

A modern web-based administration interface for managing [Garage](https://garagehq.deuxfleurs.fr/) distributed object storage clusters. Monitor cluster health, manage buckets and access keys, configure layouts, **browse and upload objects through an embedded S3 file browser** — all from a single dashboard.

> Compatible with Garage Admin API v2.
>
> **Versioning**: The major version of this project tracks the Garage Admin API version. v2.x corresponds to Admin API v2. There is no v1.0 or v0.x — Admin API v1 and v0 were already deprecated when this project was created.

## Features

- **Multi-cluster Management** — connect and manage multiple Garage clusters from a single interface
- **Dashboard Overview** — real-time cluster health, node status, and capacity visualizations
- **Bucket Management** — create, configure, and delete buckets with quota and website hosting options
- **Embedded Object Browser** — browse, upload, presign, and delete objects inside any bucket via a federated S3 Browser module
- **Access Key Management** — generate, import, and manage S3-compatible access keys
- **Permission Control** — fine-grained bucket-key permission matrix with read/write/owner toggles
- **Node Monitoring** — view node status, statistics, and trigger maintenance operations
- **Layout Management** — configure cluster topology with staged changes and preview before apply
- **Block Operations** — monitor block errors, retry failed syncs, and manage data integrity
- **Worker Management** — monitor background workers and configure performance parameters
- **Admin Token Management** — manage API tokens with scoped permissions
- **Secure Credential Storage** — AES-256-GCM encrypted storage for Garage admin tokens and S3 keys

## Screenshots

![Cluster Overview](./screenshots/overview.png)

See all screenshots in **[screenshots/README.md](./screenshots/README.md)**.

## Repository Layout

This repo is a single pnpm workspace shipping two products + three shared packages:

```
garage-admin-console/
├── garage-admin-console/   # The Admin Console product
│   ├── api/                # Backend-For-Frontend (Express + Drizzle + LibSQL)
│   └── web/                # SPA (React + Vite) — Module Federation Host
├── s3-browser/             # Standalone S3 Browser product (embeddable as MF Remote)
│   ├── api/                # BFF (same stack as Admin api)
│   └── web/                # SPA (React + Rsbuild)
├── packages/
│   ├── tokens/             # @garage/tokens — CSS variables + palette
│   ├── ui/                 # @garage/ui — shared UI primitives
│   ├── crypto/             # @garage/crypto — AES-256-GCM encrypt/decrypt (shared by both BFFs)
│   ├── bucket-api-server/  # @garage/bucket-api-server — shared Express router for the Bucket Backend API
│   └── bucket-api-contract-tests/   # Shared Bucket Backend API regression suite
├── designs/                # Historical design notes (archive)
└── e2e/                    # Playwright tests
```

## Quick Start (Docker)

Docker deployment is intentionally composable:

- **Admin-only**: run the Admin Console image by itself. Bucket pages keep working and show a fallback if the S3 Browser remote is unavailable.
- **Standalone S3 Browser**: run the S3 Browser image by itself. It serves its own API, SPA, and MF remote.
- **Embedded combined deployment**: run both product images. Admin receives `S3_BROWSER_MF_URL` at runtime and proxies `/s3-browser/*` to the S3 Browser container, so only the Admin port needs to be published.

### Using Docker Compose

```bash
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

cp docker/.env.compose.example docker/.env
# Edit docker/.env — change every secret before starting
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

With the default compose profile from `docker/.env.compose.example`, Admin is available at **http://localhost:3001** and proxies the S3 Browser remote at **http://localhost:3001/s3-browser/mf-manifest.json**. The S3 Browser container stays internal to the Compose network.

See `docker/docker-compose.yml` and `docker/.env.compose.example` for all available options. At minimum you must set:

| Variable                      | Description                                     |
| ----------------------------- | ----------------------------------------------- |
| `GARAGE_ADMIN_JWT_SECRET`     | Random string for Admin JWT signing             |
| `GARAGE_ADMIN_ENCRYPTION_KEY` | Exactly 32 characters for Admin AES-256 storage |
| `GARAGE_ADMIN_PASSWORD`       | Admin Console login password                    |
| `S3_BROWSER_MF_URL`           | Browser-visible URL to the S3 Browser manifest  |
| `S3_BROWSER_MF_PROXY_TARGET`  | Compose-internal S3 Browser URL for Admin proxy |

Set `COMPOSE_PROFILES=` for Admin-only deployment. With `COMPOSE_PROFILES=s3-browser`, the S3 Browser image runs in `S3_BROWSER_STATIC_ONLY=true` mode and only serves the MF/static assets used by Admin. To run S3 Browser as a standalone product, use the same image without `S3_BROWSER_STATIC_ONLY` and provide its own secrets.

Data is persisted in named Docker volumes (SQLite databases).

### Using Docker Run

```bash
docker build -f docker/garage-admin-console.Dockerfile -t garage-admin-console .

docker run -d \
  -p 3001:3001 \
  -v garage-data:/data \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  garage-admin-console
```

Standalone S3 Browser uses one image too:

```bash
docker build -f docker/s3-browser.Dockerfile -t s3-browser .

docker run -d \
  -p 3002:3002 \
  -v s3-browser-data:/data \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  s3-browser
```

## Development Setup

### Prerequisites

- Node.js 24+
- pnpm 10+

### Installation

```bash
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

pnpm install

# If pnpm blocks native builds
pnpm approve-builds
```

### Configuration

```bash
cp garage-admin-console/api/.env.example garage-admin-console/api/.env
# (Optional) wire S3 Browser too:
cp s3-browser/api/.env.example s3-browser/api/.env
```

Edit each `.env` with your settings. `JWT_SECRET`, `ENCRYPTION_KEY`, and `ADMIN_PASSWORD` are required for both BFFs — they refuse to start if any are missing.

### Database Setup

Migrations run automatically on BFF startup. If you want to pre-populate or run them manually:

```bash
pnpm -C garage-admin-console/api db:push       # Admin BFF
pnpm -C s3-browser/api db:push                 # S3 Browser BFF (optional)
```

Database files are created at `garage-admin-console/api/data.db` and `s3-browser/api/data.db`.

### Running

```bash
# Admin Console (api :3001 + web :5173)
pnpm dev

# In a second terminal, optionally also start S3 Browser:
pnpm -C s3-browser/api dev    # BFF on :3002
pnpm -C s3-browser/web dev    # web on :5174 — exposes the MF remoteEntry

# Then the Admin Console's BucketDetail page picks up the federated FileBrowser
# at http://localhost:5174/mf-manifest.json automatically.
```

- Admin Console: http://localhost:5173
- Admin BFF: http://localhost:3001
- S3 Browser: http://localhost:5174
- S3 Browser BFF: http://localhost:3002

### Production Build

```bash
pnpm build                                  # shared packages + Admin api + Admin web
pnpm -C s3-browser/api build                # (optional) S3 Browser BFF
pnpm -C s3-browser/web build                # (optional) S3 Browser web (emits MF manifest)

pnpm -C garage-admin-console/api start
```

Serve `garage-admin-console/web/dist/` with your preferred web server and configure reverse proxy for `/api/*` routes to the Admin BFF. If the Admin BFF serves the built SPA, set `S3_BROWSER_MF_URL` at runtime. If you statically host the SPA elsewhere, set `VITE_S3_BROWSER_MF_URL` before the Admin web build.

## Architecture

The console uses a Backend-For-Frontend (BFF) proxy pattern:

```
Browser → Admin Web ──→ Admin BFF ──→ Garage Cluster Admin API
                                  └─→ Garage S3 endpoint (per-bucket signed keys)
        └─→ (federated) S3 Browser FileBrowser remote
```

- **Authentication**: single admin password per BFF → JWT (24h expiry)
- **Credential security**: Garage admin tokens AND S3 keypairs are AES-256-GCM encrypted at rest via `@garage/crypto`
- **Proxy pattern**: frontends never communicate directly with Garage / S3 endpoints
- **Embedded browser**: Admin's bucket page mints a short-lived per-bucket S3 keypair (Garage `CreateKey + AllowBucketKey`) and forwards Bucket Backend API calls
- **Shared Bucket Backend API**: the 7 HTTP endpoints (`/list`, `/object`, `/download`, `/presign`, `/upload`, `/objects`, `/copy`) are implemented once in `@garage/bucket-api-server` as a `createBucketRouter(resolveContext)` factory. Each BFF provides its own `resolveContext` that maps an incoming request to an `{ client: S3Client, bucketName }` pair — all S3 and multipart logic lives in the shared package

## Documentation

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — how to contribute
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** — developer guide (architecture, testing, MF setup)
- **[AGENTS.md](./AGENTS.md)** — agent-oriented overview (read this first if you're new)

## Scripts

| Command                                                     | Description                                       |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `pnpm dev`                                                  | Start Admin api + web (parallel)                  |
| `pnpm -C s3-browser/api dev` / `pnpm -C s3-browser/web dev` | Start S3 Browser BFF / web                        |
| `pnpm build`                                                | Build shared packages + Admin api + web           |
| `pnpm lint` / `pnpm format`                                 | Lint / format Admin packages                      |
| `pnpm test`                                                 | Vitest for shared packages + Admin api + web      |
| `pnpm -C packages/bucket-api-contract-tests test:run`       | Bucket Backend API regression suite (env-gated)   |
| `npx playwright test`                                       | Admin Console E2E tests                           |
| `pnpm -C garage-admin-console/api db:push`                  | Apply Admin schema                                |
| `pnpm -C garage-admin-console/api db:studio`                | Open Drizzle Studio for Admin DB                  |

## Security Notes

- Deploy behind a reverse proxy with HTTPS in production
- Use strong, unique values for `JWT_SECRET`, `ENCRYPTION_KEY`, and `ADMIN_PASSWORD` on each BFF
- The console is designed for internal network deployment
- Consider additional authentication layers (VPN, SSO) for production use

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0),
consistent with the Garage project. See `LICENSE` for the full text.

### Logo assets

The Garage Admin Console logo assets in `garage-admin-console/web/public/` and the S3 Browser logo assets in `s3-browser/web/public/` are © [eyebrowkang](https://github.com/eyebrowkang) and licensed under AGPL-3.0 along with the rest of this project.

### Third-party assets

- OpenAPI specification in `garage-admin-console/web/public/garage-admin-v2.json` is sourced from the
  [Garage project repository](https://git.deuxfleurs.fr/Deuxfleurs/garage) and
  governed by Garage's own license terms.
