# Progressive Web App (PWA)

Both web apps — the **Admin Console** (Vite host) and the **S3 Browser**
(Rsbuild remote) — ship as installable PWAs: a Web App Manifest, a service
worker, and maskable icons. Installed, each runs standalone (home-screen icon,
fullscreen, app-shell offline fallback) while staying a single codebase with a
single deploy.

## What's in each app

| Piece | Admin Console | S3 Browser |
| --- | --- | --- |
| Manifest | `web/public/manifest.webmanifest` | `web/public/manifest.webmanifest` |
| Service worker | `web/public/sw.js` | `web/public/sw.js` |
| Icons | `web/public/pwa-{192,512}.png`, `pwa-maskable-512.png`, `apple-touch-icon-180.png` | same names |
| Manifest link / meta | `web/index.html` | injected via `rsbuild.config.ts` `html.tags` |
| SW registration | `web/src/main.tsx` (prod only) | `web/src/main.tsx` (prod only, **standalone entry**) |

`theme_color` is the brand orange `#ff9429`; `background_color` is `#fffdfa`
(the `@garage/tokens` background). Registration is gated on `import.meta.env.PROD`
so the dev servers' HMR is never shadowed by a cache.

## Service worker caching contract

The SW mirrors the BFFs' `Cache-Control` discipline. This is the **load-bearing
invariant**: a stale SW must never serve a version-skewed Module Federation
remote against the host's React singleton, which reproduces the React 19
two-copies "Invalid hook call".

| Request | Strategy |
| --- | --- |
| `/api/*` | network-only (never cache auth/data) |
| `/runtime-config.js` (Admin) | network-only (runtime env injection) |
| `**/remoteEntry.js`, `**/mf-manifest.json` | network-only (MF entry must match the host) |
| `/assets/*` (Admin), `/static/*` (S3), `/s3-browser/static/*` | cache-first (content-hashed, immutable) |
| navigations | network-first → fall back to the cached app shell when offline |
| other same-origin GETs | stale-while-revalidate |

Notes:

- The SW **never precaches** `index.html` / `remoteEntry.js` / `mf-manifest.json`.
  Navigations are network-first, so online users always get the fresh shell and
  remote; the cached shell is an offline-only fallback.
- It does **not** call `skipWaiting()` / `clients.claim()` — a new SW takes over
  only once every tab is closed, so a live page never has its assets swapped
  mid-session.
- The Admin SW (scope `/`) also intercepts the embedded S3 Browser's requests
  under `/s3-browser/`; the MF entry files there are network-only and the hashed
  `/s3-browser/static/*` chunks are cache-first.
- The S3 Browser registers its SW only from its **standalone** entry
  (`src/main.tsx`), never from the MF-exposed modules, so embedding the
  FileBrowser into the Admin host never double-registers a SW.

Bump `CACHE_VERSION` in either `sw.js` to force a clean cache rollover.

## Server requirements

The BFFs serve `sw.js` and `manifest.webmanifest` with `Cache-Control: no-store`
(and the manifest with `Content-Type: application/manifest+json`) so SW/manifest
updates roll out on the next load — see `api/src/index.ts` in each app. Hashed
assets stay `immutable`. No other server change is needed; the PWA reuses the
existing JWT-bearer auth and same-origin proxying unchanged.

## Session persistence

Installed apps rely on the transparent JWT refresh flow (short-lived access
token + long-lived refresh token) so users aren't bounced to `/login` daily. See
the auth notes in [architecture.md](./architecture.md). Deploying the refresh
change forces a **one-time re-login**, because pre-existing typeless tokens are
rejected.

## Regenerating icons

Icons are static assets rendered once from each app's `logo.svg` and committed.
To regenerate (e.g. after a logo change), render onto an opaque `#fffdfa` square
at 192 / 512 / 512-maskable (~66% logo for the safe zone) / 180 (apple-touch),
e.g. with `sharp`, and overwrite the files in `web/public/`.

## Verifying

1. Build (`pnpm build` + `pnpm -C s3-browser/web build`) and serve the `dist`
   via the BFF (or any static server over `http://localhost` / HTTPS — a SW
   needs a secure context).
2. Chrome DevTools → Application: confirm the manifest parses, the SW is
   **activated**, and the install affordance appears. Run a Lighthouse PWA audit.
3. On a real device: Android Chrome shows an install prompt; iOS Safari installs
   via Share → Add to Home Screen. Confirm fullscreen launch, status-bar color,
   safe-area insets, and the home-screen icon. (iOS behavior can only be
   validated on a real device.)
