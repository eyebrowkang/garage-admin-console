# Garage Admin Console (Web)

Frontend for Garage Admin Console, built with Vite + React.

## Development

```bash
pnpm -C web dev
```

The frontend uses `/api` as the base URL by default. In development this is proxied to the BFF
via `web/vite.config.ts`.

## Scripts

```bash
pnpm -C web build
pnpm -C web lint
pnpm -C web lint:fix
pnpm -C web format
pnpm -C web format:check
```
