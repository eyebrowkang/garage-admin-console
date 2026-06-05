# Garage Admin Console

[English](./README.md) | [中文](./README_zh.md)

A modern web-based administration interface for managing [Garage](https://garagehq.deuxfleurs.fr/) distributed object storage clusters. Monitor cluster health, manage buckets and access keys, configure layouts, **browse and upload objects through an embedded S3 file browser** — all from a single dashboard.

> Compatible with Garage Admin API v2.
>
> **Versioning**: the Admin Console's major version tracks the Garage Admin API version — v2.x corresponds to Admin API v2. There is no v1.0 or v0.x (those Admin API versions were already deprecated when this project was created). The S3 Browser image is released on its own independent version line.

## Features

- **Multi-cluster management** — connect and manage multiple Garage clusters from one interface
- **Dashboard overview** — real-time cluster health, node status, and capacity visualizations
- **Bucket management** — create, configure, and delete buckets with quota and website-hosting options
- **Embedded object browser** — browse, upload, presign, and delete objects inside any bucket via a federated S3 Browser module
- **Access key management** — generate, import, and manage S3-compatible access keys with a fine-grained read/write/owner permission matrix
- **Node, layout, block & worker operations** — monitor nodes, stage layout changes, retry block syncs, tune background workers
- **Admin token management** — manage API tokens with scoped permissions
- **Secure credential storage** — AES-256-GCM encrypted storage for Garage admin tokens and S3 keys

## Screenshots

| Cluster Overview | S3 File Browser |
| --- | --- |
| ![Cluster Overview](./screenshots/ClusterOverview.png) | ![S3 File Browser](./screenshots/S3FileBrowser.png) |
| ![Cluster Overview Mobile](./screenshots/ClusterOverviewMobile.png) | ![S3 File Browser Mobile](./screenshots/S3FileBrowserMobile.png) |

See all screenshots in **[screenshots/README.md](./screenshots/README.md)**.

## Quick start (Docker)

The Admin Console and the S3 Browser ship as composable images — run Admin alone,
the S3 Browser alone, both combined (Admin proxies the embedded browser so only
its port is published), or the all-in-one `garage-admin-all` image (Admin + the
embedded browser bundled in one container, served same-origin).

```bash
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

cp docker/.env.compose.example docker/.env
# Edit docker/.env — change every secret before starting
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

Admin is then at **http://localhost:3001**. See **[docs/deployment.md](./docs/deployment.md)**
for single-image builds, production env vars, and all Compose options.

## Architecture (in brief)

A Backend-For-Frontend (BFF) proxy pattern — frontends never talk to Garage / S3
directly:

```
Browser → Admin Web ──→ Admin BFF ──→ Garage Cluster Admin API
                                  └─→ Garage S3 endpoint (per-bucket signed keys)
        └─→ (federated) S3 Browser FileBrowser remote
```

Credentials are AES-256-GCM encrypted at rest; both BFFs implement one shared
**Bucket Backend API** so the same `FileBrowser` runs against either. Full
details in **[docs/architecture.md](./docs/architecture.md)**.

## Develop from source

```bash
pnpm install
cp garage-admin-console/api/.env.example garage-admin-console/api/.env
pnpm dev          # Admin api :3001 + web :5173
```

Full setup, env vars, the embedded-FileBrowser dev workflow, and troubleshooting
are in **[docs/development.md](./docs/development.md)**.

## Documentation

| Doc | What's in it |
| --- | --- |
| [docs/architecture.md](./docs/architecture.md) | System design, the two products + BFFs, Module Federation, DB schemas |
| [docs/development.md](./docs/development.md) | Local setup, env, dev servers, common tasks, troubleshooting |
| [docs/bucket-api.md](./docs/bucket-api.md) | The shared Bucket Backend API contract + conformance suite |
| [docs/testing.md](./docs/testing.md) | Test strategy, coverage, offline vs. live |
| [docs/deployment.md](./docs/deployment.md) | Docker images, production env vars, Compose |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Branching, Conventional Commits, versioning, code style |
| [AGENTS.md](./AGENTS.md) | Agent-oriented map of the repo |

## Security notes

- Deploy behind a reverse proxy with HTTPS in production.
- Use strong, unique `JWT_SECRET`, `ENCRYPTION_KEY`, and `ADMIN_PASSWORD` per BFF.
- The console targets internal-network deployment; consider an extra auth layer (VPN, SSO).

## License

Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0), consistent
with the Garage project. See [`LICENSE`](./LICENSE) for the full text.

The logo assets in `garage-admin-console/web/public/` and `s3-browser/web/public/`
are © [eyebrowkang](https://github.com/eyebrowkang), AGPL-3.0. The OpenAPI spec in
`garage-admin-console/web/public/garage-admin-v2.json` is sourced from the
[Garage project](https://git.deuxfleurs.fr/Deuxfleurs/garage) under its own license terms.
