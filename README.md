# Garage Admin Console

Garage administration console (frontend + BFF).

## Structure

- `api/` BFF service (Express + Prisma)
- `web/` Frontend (Vite + React)
- `garage-admin-v2.json` Garage admin API OpenAPI spec

## Local Development

1. Install dependencies

```bash
cd api && npm install
cd ../web && npm install
```

2. Start services

```bash
cd api && npm run dev
```

```bash
cd web && npm run dev
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

API:

```bash
npm run dev
npm run build
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

Web:

```bash
npm run dev
npm run build
npm run lint
npm run lint:fix
npm run format
npm run format:check
```
