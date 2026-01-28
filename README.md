# Garage Admin Console

Garage administration console (frontend + BFF).

## Structure

- `api/` BFF service (Express + Prisma)
- `web/` Frontend (Vite + React)
- `garage-admin-v2.json` Garage admin API OpenAPI spec

## Local Development

1. Install dependencies

```bash
pnpm install
```

If pnpm blocks native build scripts (e.g. Prisma, bcrypt, sqlite3), run:

```bash
pnpm approve-builds
```

2. Start services

```bash
pnpm dev
```

The frontend defaults to `/api` for the BFF. In development this is proxied via `web/vite.config.ts`.
In production, use Nginx to reverse-proxy `/api` to the BFF.
If needed, set `VITE_API_BASE_URL` in `web/.env`.

## Environment (api)

Example `api/.env`:

```bash
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me"
ENCRYPTION_KEY="01234567890123456789012345678901"
PORT=3001
```

## Scripts

Workspace:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
```

API only:

```bash
pnpm -C api dev
pnpm -C api build
pnpm -C api lint
pnpm -C api lint:fix
pnpm -C api format
pnpm -C api format:check
```

Web only:

```bash
pnpm -C web dev
pnpm -C web build
pnpm -C web lint
pnpm -C web lint:fix
pnpm -C web format
pnpm -C web format:check
```
