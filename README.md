# Garage Admin Console

[English](./README.md) | [中文](./README_zh.md)

A modern web-based administration interface for managing [Garage](https://garagehq.deuxfleurs.fr/) distributed object storage clusters, with a companion **S3 Browser** for managing objects in any S3-compatible storage.

> Compatible with Garage Admin API v2.
>
> **Versioning**: The major version tracks the Garage Admin API version. v2.x corresponds to Admin API v2. There is no v1.0 or v0.x — Admin API v1 and v0 were already deprecated when this project was created.

## Features

### Admin Console

- **Multi-cluster Management** — Connect and manage multiple Garage clusters from a single dashboard
- **Real-time Monitoring** — Cluster health, node status, and capacity visualizations
- **Bucket Management** — Create, configure, and delete buckets with quota and website hosting
- **Access Key Management** — Generate, import, and manage S3-compatible access keys
- **Permission Control** — Fine-grained bucket-key permission matrix
- **Node & Layout** — Monitor nodes, configure cluster topology with staged changes
- **Block & Worker Ops** — Block error management, worker monitoring, performance tuning
- **Admin Tokens** — Manage API tokens with scoped permissions
- **Secure Storage** — AES-256-GCM encrypted credential storage

### S3 Browser

- **S3-Compatible** — Works with Garage, AWS S3, MinIO, and any S3-compatible storage
- **Connection Manager** — Save multiple endpoints with encrypted credentials
- **Object Browser** — Navigate folders, upload (drag-and-drop, up to 5 GB), download, delete
- **Module Federation** — Embeddable components for integration into the Admin Console

## Screenshots

![Cluster Overview](./screenshots/overview.png)

See all screenshots in **[screenshots/README.md](./screenshots/README.md)**.

## Quick Start (Docker)

### Admin Console Only

```bash
docker compose up -d
```

Access at **http://localhost:3001**. Edit `docker-compose.yml` to set the required environment variables first.

### S3 Browser Only

```bash
docker build -t s3-browser -f docker/s3-browser.Dockerfile .
docker run -d -p 3002:3002 -v s3-data:/data \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  s3-browser
```

Access at **http://localhost:3002**.

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Random string for JWT signing |
| `ENCRYPTION_KEY` | Exactly 32 characters for AES-256 encryption |
| `ADMIN_PASSWORD` | Console login password |

See [Deployment Guide](./docs/deployment.md) for all deployment modes and Docker Compose examples.

## Development Setup

### Prerequisites

- Node.js 24+
- pnpm 10+

### Installation

```bash
git clone https://github.com/eyebrowkang/garage-admin-console.git
cd garage-admin-console

pnpm install
pnpm approve-builds    # if prompted for native builds
```

### Configuration

```bash
# Admin Console
cp apps/admin/api/.env.example apps/admin/api/.env

# S3 Browser
cp apps/s3-browser/api/.env.example apps/s3-browser/api/.env
```

Edit both `.env` files — `JWT_SECRET`, `ENCRYPTION_KEY`, and `ADMIN_PASSWORD` are required.

### Running

```bash
pnpm dev              # Start all apps concurrently
pnpm dev:admin        # Admin only (API: 3001, Web: 5173)
pnpm dev:s3           # S3 Browser only (API: 3002, Web: 5174)
```

Databases are created automatically on first startup — no manual migration needed.

## Project Structure

```
garage-admin-console/
├── apps/
│   ├── admin/
│   │   ├── api/              # Admin BFF (Express 5, Drizzle ORM, SQLite)
│   │   └── web/              # Admin SPA (React 19, Vite) — MF Host
│   └── s3-browser/
│       ├── api/              # S3 Browser BFF (Express 5, AWS SDK v3, SQLite)
│       └── web/              # S3 Browser SPA (React 19, Vite) — MF Remote
├── packages/
│   ├── auth/                 # Shared JWT auth middleware
│   ├── ui/                   # Shared UI components (shadcn/ui)
│   └── tsconfig/             # Shared TypeScript configs
├── docker/                   # Dockerfiles (admin, s3-browser, combined)
├── docs/                     # Documentation
└── e2e/                      # Playwright E2E tests
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all dev servers |
| `pnpm dev:admin` | Start admin API + web only |
| `pnpm dev:s3` | Start S3 Browser API + web only |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Format all code with Prettier |
| `pnpm typecheck` | Type-check all packages |
| `pnpm test` | Run all tests |
| `npx playwright test` | Run E2E tests |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/architecture.md) | System architecture, BFF pattern, data flow diagrams |
| [Deployment](./docs/deployment.md) | Docker deployment modes with Compose examples |
| [Module Federation](./docs/module-federation.md) | MF integration guide for embedding S3 Browser |
| [S3 Browser](./docs/s3-browser.md) | S3 Browser features, API reference, configuration |
| [Development](./DEVELOPMENT.md) | Developer setup, project structure, code style |
| [Contributing](./CONTRIBUTING.md) | Contribution workflow, commit conventions |

## Security

- Deploy behind a reverse proxy with HTTPS in production
- Use strong, unique values for all secrets
- Designed for internal network deployment
- Consider VPN or additional auth layers for production use

## License

Licensed under [AGPL-3.0](./LICENSE), consistent with the Garage project.

Assets from the [Garage project](https://git.deuxfleurs.fr/Deuxfleurs/garage) (logos in `apps/admin/web/public/`, OpenAPI spec) are governed by Garage's own license.
