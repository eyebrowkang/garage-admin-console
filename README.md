# Garage Admin Console

[English](./README.md) | [中文](./README.zh.md)

A modern web-based administration interface for managing [Garage](https://garagehq.deuxfleurs.fr/) distributed object storage clusters. Monitor cluster health, manage buckets and access keys, configure layouts, and more — all from a single dashboard.

> Compatible with Garage Admin API v2.

## Features

- **Multi-cluster Management** - Connect and manage multiple Garage clusters from a single interface
- **Dashboard Overview** - Real-time cluster health, node status, and capacity visualizations
- **Bucket Management** - Create, configure, and delete buckets with quota and website hosting options
- **Access Key Management** - Generate, import, and manage S3-compatible access keys
- **Permission Control** - Fine-grained bucket-key permission matrix with read/write/owner toggles
- **Node Monitoring** - View node status, statistics, and trigger maintenance operations
- **Layout Management** - Configure cluster topology with staged changes and preview before apply
- **Block Operations** - Monitor block errors, retry failed syncs, and manage data integrity
- **Worker Management** - Monitor background workers and configure performance parameters
- **Admin Token Management** - Manage API tokens with scoped permissions
- **Secure Credential Storage** - AES-256-GCM encrypted storage for Garage admin tokens

## Quick Start (Docker)

The easiest way to run the console is with Docker. A single image bundles both the frontend and API.

### Using Docker Compose

```bash
# Clone the repository
git clone <repository-url>
cd garage-admin-console

# Edit docker-compose.yml — change the three required environment variables
# Then start the service:
docker compose up -d
```

The console is available at **http://localhost:3001**.

See `docker-compose.yml` for all available options. At minimum you must set:

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Random string for JWT signing |
| `ENCRYPTION_KEY` | Exactly 32 characters for AES-256 encryption |
| `ADMIN_PASSWORD` | Console login password |

Data is persisted in the `/data` volume (SQLite database).

### Using Docker Run

```bash
docker build -t garage-admin-console .

docker run -d \
  -p 3001:3001 \
  -v garage-data:/data \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  garage-admin-console
```

## Development Setup

### Prerequisites

- Node.js 24+
- pnpm 10+

### Installation

```bash
git clone <repository-url>
cd garage-admin-console

pnpm install

# If pnpm blocks native builds (Prisma)
pnpm approve-builds
```

### Configuration

Create the API environment file from the provided template:

```bash
cp api/.env.example api/.env
```

Edit `api/.env` with your settings. See `api/.env.example` for all available variables and their descriptions. `JWT_SECRET`, `ENCRYPTION_KEY`, and `ADMIN_PASSWORD` are required — the API will refuse to start if any are missing.

### Database Setup

```bash
pnpm -C api db:push
```

The database file is created at `api/data.db` automatically.

### Running

```bash
pnpm dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

### Production Build

```bash
pnpm build
pnpm -C api start
```

Serve `web/dist/` with your preferred web server (Nginx, Caddy, etc.) and configure reverse proxy for `/api/*` routes to the API server.

## Project Structure

```
garage-admin-console/
├── api/                 # Backend-For-Frontend (Express + Prisma)
├── web/                 # Frontend SPA (React + Vite)
├── e2e/                 # End-to-end tests (Playwright)
└── web/public/garage-admin-v2.json  # Garage Admin API OpenAPI specification
```

## Architecture

The console uses a Backend-For-Frontend (BFF) proxy pattern:

```
Browser → Frontend → BFF API → Garage Cluster
```

- **Authentication**: Single admin password → JWT token (24h expiry)
- **Credential Security**: Garage admin tokens are AES-256-GCM encrypted at rest
- **Proxy Pattern**: Frontend never communicates directly with Garage clusters

## Documentation

- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Developer guide with architecture details, testing, and contribution guidelines

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development servers |
| `pnpm build` | Build for production |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format code with Prettier |
| `pnpm -C web test` | Run unit tests |
| `npx playwright test` | Run E2E tests |
| `pnpm -C api db:push` | Push schema to database |
| `pnpm -C api db:studio` | Open Prisma Studio GUI |

## Security Notes

- Deploy behind a reverse proxy with HTTPS in production
- Use strong, unique values for `JWT_SECRET`, `ENCRYPTION_KEY`, and `ADMIN_PASSWORD`
- The console is designed for internal network deployment
- Consider additional authentication layers (VPN, SSO) for production use

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0),
consistent with the Garage project. See `LICENSE` for the full text.

The following assets are sourced from the Garage project repository and are governed by
Garage's own license terms:

- Logo assets in `web/public/garage.svg`, `web/public/garage.png`,
  `web/public/garage-notext.svg`, and `web/public/garage-notext.png`
- OpenAPI specification in `web/public/garage-admin-v2.json`
