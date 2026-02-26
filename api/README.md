# Garage Admin Console - API

Backend-For-Frontend (BFF) service for Garage Admin Console.

**Tech Stack**: Express 5, TypeScript, Drizzle ORM, SQLite/LibSQL, Zod, Axios, Pino, Morgan

## Architecture (API Only)

```mermaid
flowchart LR
  subgraph Client
    Browser[Admin Console / Browser]
  end

  subgraph API[BFF API]
    Routes[Express Routes]
    Auth[JWT Auth Middleware]
    Proxy[Proxy Route]
    DB[(SQLite via Drizzle + LibSQL)]
    Crypto[AES-256-GCM Encryption]
  end

  subgraph Garage[Garage Cluster]
    GarageAPI[Garage Admin API]
  end

  Browser -->|/auth| Routes
  Browser -->|/clusters| Auth --> Routes
  Browser -->|/proxy/:clusterId/*| Auth --> Proxy --> GarageAPI
  Routes --> DB
  Routes --> Crypto
  Proxy --> Crypto
```

## Development

```bash
pnpm -C api dev        # Start dev server (http://localhost:3001)
pnpm -C api build      # Compile TypeScript
pnpm -C api start      # Run compiled code
pnpm -C api typecheck  # Type check without emit
pnpm -C api lint       # Lint code
```

## Database

```bash
pnpm -C api db:generate  # Generate migration SQL from schema changes
pnpm -C api db:push      # Push schema directly (development only)
pnpm -C api db:seed      # Run seed script
pnpm -C api db:studio    # Open Drizzle Studio
```

Schema is defined in `src/db/schema.ts`. Migrations are in `drizzle/` and run automatically on startup.

## Configuration

Copy `.env.example` to `.env` and configure. See `.env.example` for all available variables. `JWT_SECRET`, `ENCRYPTION_KEY`, and `ADMIN_PASSWORD` are required.

In development, the database is stored at `api/data.db`. In production (Docker), the `DATA_DIR` environment variable controls the database directory (defaults to `/data`).

## Documentation

See [DEVELOPMENT.md](../DEVELOPMENT.md) for the detailed development guide.
