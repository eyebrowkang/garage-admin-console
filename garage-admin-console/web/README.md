# @garage-admin/web

Frontend SPA for the Garage Admin Console — also the **Module Federation Host** for the embedded S3 Browser FileBrowser.

**Tech stack**: React 19, TypeScript, Vite, TanStack Query, React Router v7, Tailwind v4, `@garage/ui` + `@garage/tokens`, `@module-federation/runtime`.

## Development

```bash
pnpm -C garage-admin-console/web dev         # http://localhost:5173
pnpm -C garage-admin-console/web build       # production build
pnpm -C garage-admin-console/web test        # Vitest watch
pnpm -C garage-admin-console/web lint
```

The dev server proxies `/api/*` to `http://localhost:3001` (configured in `vite.config.ts`).

## Module Federation host

The Admin Console deliberately does NOT use `@module-federation/vite`. That plugin's build-time share registration races the Rsbuild-built remote's `consume_default_react` wrapper and trips React 19's two-copies guard. Instead the host owns federation via `@module-federation/runtime`:

- [`src/mf-init.ts`](src/mf-init.ts) calls `init()` at entry with explicit `lib: () => React/ReactDOM` references so the host's React copies are registered in the share scope before any remote loads. Exports `mfInstance`.
- [`src/main.tsx`](src/main.tsx) imports `./mf-init` as its very first line.
- [`src/components/cluster/BucketObjectBrowser.tsx`](src/components/cluster/BucketObjectBrowser.tsx) uses `React.lazy(() => mfInstance.loadRemote('s3Browser/FileBrowser'))` inside a `Suspense` + custom `ErrorBoundary`.

The remote URL is `VITE_S3_BROWSER_MF_URL`. If unset in development, the host derives the manifest URL from the current browser hostname on port `5174`, so `localhost` and LAN URLs both resolve to the matching S3 Browser dev server. See [`.env.example`](.env.example).

If the remote is unreachable, BucketObjectBrowser shows a graceful fallback panel — the Admin Console keeps working.

## UI primitives

Imports from `@garage/ui` (`Button`, `Card`, `Dialog`, `Table`, `cn`, etc.) and reads design tokens from `@garage/tokens`. Both are workspace deps (`workspace:*`), built once and consumed at build time — NOT shared via MF.

The host stylesheet imports them in the right order so Tailwind v4 resolves utility classes referenced by `@garage/ui` (see [`src/index.css`](src/index.css)):

```css
@import '@garage/tokens/style.css';
@import '@garage/ui/style.css';
@import 'tailwindcss';
```

Splitting these imports across CSS and JS (e.g. doing `import '@garage/ui/style.css'` from `main.tsx`) causes Tailwind v4 to tree-shake utilities like `text-primary-foreground`, which makes primary buttons render with dark foreground text.

## Configuration

| Variable                 | Required | Description                                                                                                                                                                          |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_S3_BROWSER_MF_URL` | No       | URL of `s3-browser/web`'s MF manifest. In development, defaults to the current browser hostname on port `5174`. Bake this in at build time when deploying with the embedded browser. |

## Documentation

See [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md) for project structure, component organization, custom hooks, testing, and the full Module Federation setup, and [`../../designs/mf-integration-plan.md`](../../designs/mf-integration-plan.md) for the architectural contract.
