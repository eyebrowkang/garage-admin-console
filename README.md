# Garage Admin Console

A modern web-based administration interface for managing [Garage](https://garagehq.deuxfleurs.fr/) distributed object storage clusters.

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

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 10+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/garage-admin-console.git
cd garage-admin-console

# Install dependencies
pnpm install

# If pnpm blocks native builds (Prisma, bcrypt, sqlite3)
pnpm approve-builds
```

### Configuration

Create the API environment file:

```bash
cp api/.env.example api/.env
```

Edit `api/.env` with your settings:

```bash
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secure-jwt-secret"      # Change this!
ENCRYPTION_KEY="your-32-byte-key-here"   # Must be exactly 32 bytes
PORT=3001
ADMIN_PASSWORD="your-admin-password"     # Console login password
```

### Database Setup

```bash
# Initialize the database schema
pnpm -C api db:push

# Or run migrations (creates migration history)
pnpm -C api db:migrate
```

The database will be created automatically at the path specified in `DATABASE_URL`.

### Development

```bash
# Start both API and frontend
pnpm dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

### Production Build

```bash
# Build both packages
pnpm build

# Start the API server
pnpm -C api start
```

Serve the `web/dist/` directory with your preferred web server (Nginx, Caddy, etc.) and configure reverse proxy for `/api/*` routes to the API server.

## Project Structure

```
garage-admin-console/
├── api/                 # Backend-For-Frontend (Express + Prisma)
├── web/                 # Frontend SPA (React + Vite)
├── e2e/                 # End-to-end tests (Playwright)
└── garage-admin-v2.json # Garage Admin API OpenAPI specification
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
- **[CLAUDE.md](./CLAUDE.md)** - AI assistant context for Claude Code

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
| `pnpm -C api db:migrate` | Run database migrations |
| `pnpm -C api db:studio` | Open Prisma Studio GUI |
| `pnpm -C api db:reset` | Reset database (deletes all data) |

## Security Notes

- Deploy behind a reverse proxy with HTTPS in production
- Use strong, unique values for `JWT_SECRET` and `ENCRYPTION_KEY`
- The console is designed for internal network deployment
- Consider additional authentication layers (VPN, SSO) for production use

## License

MIT
