# @garage-admin/web

Frontend SPA for the Garage Admin Console — and the **Module Federation Host** for the embedded S3 Browser `FileBrowser`.

**Tech stack:** React 19, TypeScript, Vite, TanStack Query, React Router v7, Tailwind v4, `@garage/ui` + `@garage/tokens` + `@garage/web-shared`, `@module-federation/runtime`.

## Module Federation host (in brief)

This app deliberately does **not** use `@module-federation/vite`; it owns federation via `@module-federation/runtime` — [`src/mf-init.ts`](src/mf-init.ts) registers the host's React and exports `mfInstance`, which [`src/components/cluster/BucketObjectBrowser.tsx`](src/components/cluster/BucketObjectBrowser.tsx) uses to load `s3Browser/FileBrowser`. The remote URL is `VITE_S3_BROWSER_MF_URL` (see [`.env.example`](.env.example)); if the remote is unreachable, the bucket page shows a graceful fallback.

The full rationale, plus the load-bearing `@garage/ui` CSS cascade in [`src/index.css`](src/index.css), is in
[docs/architecture.md](../../docs/architecture.md#module-federation).

## Documentation

Local dev, env, and scripts → [docs/development.md](../../docs/development.md).
Structure, routing, and the MF deep-dive → [docs/architecture.md](../../docs/architecture.md#admin-web).
