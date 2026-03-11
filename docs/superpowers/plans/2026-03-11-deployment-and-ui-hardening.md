# Deployment And UI Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize standalone Admin and standalone S3 Browser behavior, repair the combined deployment so it behaves as a single Admin shell with embedded S3 capability, and clean up obvious UI migration inconsistencies without adding new features.

**Architecture:** Keep `apps/admin/*` and `apps/s3-browser/*` as separate application units. Fix runtime composition instead of collapsing boundaries: standalone modes continue to run independently, while combined mode runs Admin API externally and S3 Browser API internally, serves only the Admin SPA, and exposes S3 Browser frontend assets strictly for Module Federation embedding. UI cleanup is limited to baseline functional regressions first, then cross-cutting consistency normalization.

**Tech Stack:** pnpm workspace, React 19, Vite, `@module-federation/vite`, TanStack Query, Express 5, Drizzle ORM, LibSQL/SQLite, Vitest, Playwright, Docker.

---

Use `@superpowers/test-driven-development` while executing each task and `@superpowers/verification-before-completion` before claiming the work is done.

---

## File Map

### Admin API

- Modify: `apps/admin/api/src/app.ts`
  Purpose: preserve route registration order and keep same-origin S3 proxy behavior explicit.
- Modify: `apps/admin/api/src/config/env.ts`
  Purpose: harden S3 integration env handling and keep combined-mode defaults testable.
- Modify: `apps/admin/api/src/routes/s3-api-proxy.ts`
  Purpose: enforce `/s3-api` proxy contract, error messages, passthrough behavior, and download/upload safety.
- Modify: `apps/admin/api/src/routes/s3-bridge.ts`
  Purpose: harden bridge setup, connection reuse/update behavior, and failure reporting.
- Modify: `apps/admin/api/src/index.ts`
  Purpose: make combined-mode static asset behavior explicit and keep Admin as the only product shell.
- Create: `apps/admin/api/src/test/helpers/load-admin-app.ts`
  Purpose: provide a deterministic way to reset modules and import a fresh app/env graph for env-sensitive route tests.
- Create: `apps/admin/api/src/test/s3-api-proxy.test.ts`
  Purpose: route-level regression coverage for proxy passthrough and failure handling.
- Create: `apps/admin/api/src/test/s3-bridge.test.ts`
  Purpose: route-level regression coverage for bridge env guards, upstream auth flow, and connection reuse.

### Admin Web

- Create: `apps/admin/web/src/lib/mf-config.ts`
  Purpose: hold the single build-time rule for resolving the S3 Browser remote entry.
- Create: `apps/admin/web/src/lib/mf-config.test.ts`
  Purpose: verify the remote-entry default and override behavior without testing `vite.config.ts` indirectly.
- Modify: `apps/admin/web/vite.config.ts`
  Purpose: make the remote entry path configurable at build time while preserving the same-origin combined default.
- Modify: `apps/admin/web/src/pages/cluster/BucketDetail.tsx`
  Purpose: integrate a smaller, testable embedded-S3 panel and keep degraded states explicit.
- Create: `apps/admin/web/src/components/cluster/BucketObjectBrowserCard.tsx`
  Purpose: own the Bucket Detail embedded object-browser panel, including connection, degraded, loading, and embedded states.
- Create: `apps/admin/web/src/components/cluster/BucketObjectBrowserCard.test.tsx`
  Purpose: component-level coverage for read/write state, degraded state, and connection UI behavior.
- Modify: `apps/admin/web/src/components/MFErrorBoundary.tsx`
  Purpose: keep MF failure handling explicit and product-appropriate in standalone vs integrated scenarios.
- Create: `apps/admin/web/src/components/MFErrorBoundary.test.tsx`
  Purpose: cover fallback rendering and error-boundary reset expectations.
- Create: `apps/admin/web/src/pages/Dashboard.test.tsx`
  Purpose: cover standalone Dashboard loading and empty cluster states after migration cleanup.
- Create: `apps/admin/web/src/test/setup.ts`
  Purpose: provide the missing Vitest/JSDOM setup required by the existing test config.
- Modify: `apps/admin/web/src/pages/Dashboard.tsx`
  Purpose: normalize migrated loading/empty/error states where standalone behavior is visibly rough.
- Modify: `apps/admin/web/src/pages/S3BrowserTest.tsx`
  Purpose: keep the MF smoke page aligned with the remote-entry contract used during development.

### S3 Browser API

- Modify: `apps/s3-browser/api/src/index.ts`
  Purpose: keep standalone static serving clear and avoid accidental combined-shell assumptions.
- Modify: `apps/s3-browser/api/src/config/env.ts`
  Purpose: expose any small env clarifications needed by combined startup without widening scope.

### S3 Browser Web

- Modify: `apps/s3-browser/web/package.json`
  Purpose: add the missing S3 Browser web test dependencies required for Vitest/JSDOM coverage.
- Modify: `apps/s3-browser/web/src/App.tsx`
  Purpose: keep basename/standalone routing stable after hardening.
- Modify: `apps/s3-browser/web/src/layouts/ConnectionLayout.tsx`
  Purpose: normalize connection-header and error-state behavior.
- Modify: `apps/s3-browser/web/src/pages/Dashboard.tsx`
  Purpose: clean up migrated list/empty state inconsistencies.
- Modify: `apps/s3-browser/web/src/pages/BucketList.tsx`
  Purpose: normalize bucket empty/error/loading behavior and redirect behavior.
- Modify: `apps/s3-browser/web/src/pages/ObjectBrowserPage.tsx`
  Purpose: normalize standalone object-browser states and keep breadcrumb/query behavior stable.
- Modify: `apps/s3-browser/web/src/components/BucketExplorer.tsx`
  Purpose: normalize embedded bucket-list behavior and state messaging.
- Modify: `apps/s3-browser/web/src/components/ObjectBrowser.tsx`
  Purpose: normalize embedded object-browser behavior and reduce standalone/embedded state drift.
- Create: `apps/s3-browser/web/src/components/BucketExplorer.test.tsx`
  Purpose: component-level coverage for embedded bucket-list and direct-to-bucket behavior.
- Create: `apps/s3-browser/web/src/components/ObjectBrowser.test.tsx`
  Purpose: component-level coverage for embedded error/empty/read-only states.
- Create: `apps/s3-browser/web/src/App.test.tsx`
  Purpose: cover basename routing and protected-route expectations.
- Create: `apps/s3-browser/web/src/layouts/ConnectionLayout.test.tsx`
  Purpose: cover connection-layout loading and error states.
- Create: `apps/s3-browser/web/src/pages/BucketList.test.tsx`
  Purpose: cover fixed-bucket redirect behavior and standalone bucket states.
- Create: `apps/s3-browser/web/src/pages/ObjectBrowserPage.test.tsx`
  Purpose: cover standalone object-browser empty/error/breadcrumb states.
- Create: `apps/s3-browser/web/src/test/setup.ts`
  Purpose: shared Vitest/JSDOM setup for S3 Browser web tests.
- Modify: `apps/s3-browser/web/vitest.config.ts`
  Purpose: load the shared test setup file explicitly.

### Workspace Root

- Modify: `pnpm-lock.yaml`
  Purpose: record the S3 Browser web test-harness dependency changes deterministically.

### Docker / Deployment

- Modify: `docker/combined.Dockerfile`
  Purpose: package both backend runtimes correctly, copy only MF assets needed for embedding, and bake in the combined-mode internal topology.
- Create: `docker/combined-entrypoint.sh`
  Purpose: start internal S3 Browser API and external Admin API with signal handling under `tini`.
- Modify: `docker/admin.Dockerfile`
  Purpose: accept a build-time remote-entry override for external S3 Browser integration without changing the default combined path.
- Modify: `docker/s3-browser.Dockerfile`
  Purpose: keep packaging expectations aligned after combined runtime changes if build artifacts move.

### Documentation

- Modify: `docs/deployment.md`
  Purpose: document the combined runtime model, internal S3 API usage, and validation matrix.
- Modify: `docs/module-federation.md`
  Purpose: document remote-entry expectations, combined-mode asset serving, and side-by-side build-time configuration.
- Modify: `README.md`
  Purpose: keep high-level deployment descriptions aligned with the actual product model.
- Modify: `README_zh.md`
  Purpose: keep the Chinese overview aligned with the same deployment model.

## Chunk 1: Standalone Admin Baseline And Test Harness

### Task 1: Repair the Admin web test harness before touching UI behavior

**Files:**
- Create: `apps/admin/web/src/test/setup.ts`
- Create: `apps/admin/web/src/components/MFErrorBoundary.test.tsx`
- Test: `apps/admin/web/vitest.config.ts`

- [ ] **Step 1: Write the failing boundary smoke test**

```tsx
import { render, screen } from '@testing-library/react';
import { MFErrorBoundary } from './MFErrorBoundary';

function Boom() {
  throw new Error('mf failed');
}

it('renders the S3 Browser unavailable fallback', () => {
  render(
    <MFErrorBoundary>
      <Boom />
    </MFErrorBoundary>,
  );

  expect(screen.getByText(/S3 Browser not available/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to capture the current failure**

Run: `pnpm -C apps/admin/web test:run -- src/components/MFErrorBoundary.test.tsx`
Expected: FAIL because `apps/admin/web/src/test/setup.ts` is missing or the test environment is not initialized.

- [ ] **Step 3: Add the missing Vitest/JSDOM setup**

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

- [ ] **Step 4: Re-run the boundary test**

Run: `pnpm -C apps/admin/web test:run -- src/components/MFErrorBoundary.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit the harness fix**

```bash
git add apps/admin/web/src/test/setup.ts apps/admin/web/src/components/MFErrorBoundary.test.tsx
git commit -m "test: add admin web vitest setup"
```

### Task 2: Lock down Admin API S3 integration boundaries with route tests

**Files:**
- Create: `apps/admin/api/src/test/helpers/load-admin-app.ts`
- Create: `apps/admin/api/src/test/s3-api-proxy.test.ts`
- Create: `apps/admin/api/src/test/s3-bridge.test.ts`
- Modify: `apps/admin/api/src/routes/s3-api-proxy.ts`
- Modify: `apps/admin/api/src/routes/s3-bridge.ts`
- Test: `apps/admin/api/src/test/setup.ts`

- [ ] **Step 1: Write the failing `/s3-api` proxy tests**

Cover at least:

```ts
it('returns 503 when S3 Browser integration is not configured');
it('forwards authorization and query params to the S3 Browser API');
it('passes through download headers from upstream');
```

- [ ] **Step 2: Add deterministic env-sensitive test scaffolding**

Create a small helper with this contract:

```ts
export async function loadAdminAppForTest(overrides: Record<string, string | undefined> = {}) {
  const previousEnv = { ...process.env };
  vi.resetModules();

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const [{ app }, { env }] = await Promise.all([import('../../app.js'), import('../../config/env.js')]);
  return {
    app,
    env,
    restoreEnv() {
      for (const key of Object.keys(process.env)) {
        if (!(key in previousEnv)) {
          delete process.env[key];
        }
      }

      Object.assign(process.env, previousEnv);
    },
  };
}
```

Use it instead of mutating imported `env` objects in-place, and call `restoreEnv()` in `afterEach` so missing-config cases really exercise absent env vars instead of the string `'undefined'`.

- [ ] **Step 3: Write the failing bridge tests**

Cover at least:

```ts
it('returns 503 when S3_BROWSER_API_URL is missing');
it('reuses an existing admin-bridge connection when names match');
it('returns a 502-style error when S3 Browser auth fails');
```

- [ ] **Step 4: Run the new Admin API tests**

Run: `pnpm -C apps/admin/api test:run -- src/test/s3-api-proxy.test.ts src/test/s3-bridge.test.ts`
Expected: FAIL on missing coverage or current route behavior mismatches.

- [ ] **Step 5: Implement the minimal route fixes**

Implementation targets:
- keep `/s3-api` passthrough behavior explicit and symmetric with existing proxy tests;
- make bridge errors deterministic and user-readable;
- keep connection reuse/update logic stable for embedded access.

- [ ] **Step 6: Re-run the focused Admin API tests**

Run: `pnpm -C apps/admin/api test:run -- src/test/s3-api-proxy.test.ts src/test/s3-bridge.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full Admin API test suite**

Run: `pnpm -C apps/admin/api test:run`
Expected: PASS.

- [ ] **Step 8: Commit the API hardening**

```bash
git add apps/admin/api/src/routes/s3-api-proxy.ts apps/admin/api/src/routes/s3-bridge.ts apps/admin/api/src/test/helpers/load-admin-app.ts apps/admin/api/src/test/s3-api-proxy.test.ts apps/admin/api/src/test/s3-bridge.test.ts
git commit -m "fix: harden admin s3 integration routes"
```

### Task 3: Extract and harden the Admin bucket embedded-S3 panel

**Files:**
- Create: `apps/admin/web/src/components/cluster/BucketObjectBrowserCard.tsx`
- Create: `apps/admin/web/src/components/cluster/BucketObjectBrowserCard.test.tsx`
- Modify: `apps/admin/web/src/pages/cluster/BucketDetail.tsx`
- Modify: `apps/admin/web/src/components/MFErrorBoundary.tsx`
- Modify: `apps/admin/web/src/pages/Dashboard.tsx`
- Create: `apps/admin/web/src/pages/Dashboard.test.tsx`

- [ ] **Step 1: Write the failing embedded-panel tests**

Cover at least:

```tsx
it('renders a degraded message when no readable key exists');
it('passes readonly=true into the remote config when the selected key is read-only');
it('shows the MF fallback when the remote fails to load');
it('clears the MF fallback when a reset key changes after retry or reconnect');
it('renders the admin dashboard empty state cleanly when no clusters exist');
```

- [ ] **Step 2: Run the new Admin web tests**

Run: `pnpm -C apps/admin/web test:run -- src/components/cluster/BucketObjectBrowserCard.test.tsx src/components/MFErrorBoundary.test.tsx src/pages/Dashboard.test.tsx`
Expected: FAIL because the embedded panel is still buried in `BucketDetail.tsx` and the states are not yet isolated/testable.

- [ ] **Step 3: Extract the embedded object-browser panel into its own component**

Implementation rules:
- `BucketDetail.tsx` keeps data loading for the bucket page;
- `BucketObjectBrowserCard.tsx` owns readable-key selection, bridge connect, degraded state, and embedded render/fallback state;
- `MFErrorBoundary` gets an explicit reset contract, for example a `resetKey` prop that clears the stored error state when the host retries or reconnects;
- no behavior expansion beyond current capabilities.

- [ ] **Step 4: Normalize obvious standalone Admin state drift**

Limit changes to:
- Dashboard loading spinner structure;
- Dashboard empty cluster state copy and spacing;
- bucket-detail messaging that currently implies S3 Browser is always deployed when it is optional.

- [ ] **Step 5: Re-run focused Admin web tests**

Run: `pnpm -C apps/admin/web test:run -- src/components/cluster/BucketObjectBrowserCard.test.tsx src/components/MFErrorBoundary.test.tsx src/pages/Dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run Admin web typecheck**

Run: `pnpm -C apps/admin/web typecheck`
Expected: PASS.

- [ ] **Step 7: Smoke-check standalone Admin before committing**

Run: `pnpm dev:admin`
Verify:
- `http://localhost:5173/login` loads;
- sign-in works;
- Dashboard empty/loading states match the intended cleanup;
- cluster navigation works;
- bucket detail degrades cleanly when S3 integration is not configured.

- [ ] **Step 8: Commit the standalone Admin UI hardening**

```bash
git add apps/admin/web/src/components/cluster/BucketObjectBrowserCard.tsx apps/admin/web/src/components/cluster/BucketObjectBrowserCard.test.tsx apps/admin/web/src/pages/cluster/BucketDetail.tsx apps/admin/web/src/components/MFErrorBoundary.tsx apps/admin/web/src/pages/Dashboard.tsx apps/admin/web/src/pages/Dashboard.test.tsx
git commit -m "fix: stabilize standalone admin embedded s3 states"
```

## Chunk 2: Standalone S3 Browser Baseline

### Task 1: Repair the S3 Browser web test harness

**Files:**
- Modify: `apps/s3-browser/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/s3-browser/web/src/test/setup.ts`
- Modify: `apps/s3-browser/web/vitest.config.ts`
- Create: `apps/s3-browser/web/src/components/BucketExplorer.test.tsx`
- Create: `apps/s3-browser/web/src/components/ObjectBrowser.test.tsx`

- [ ] **Step 1: Add the missing S3 Browser web test dependencies**

Run:

```bash
pnpm -C apps/s3-browser/web add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Expected: `apps/s3-browser/web/package.json` and `pnpm-lock.yaml` now declare the same baseline test stack already used by Admin web.

- [ ] **Step 2: Write the failing embedded component tests**

Cover at least:

```tsx
it('shows the bucket list when no bucket is preselected');
it('goes directly to object browsing when a bucket is preselected');
it('shows read-only object browser controls correctly');
```

- [ ] **Step 3: Run the S3 Browser web tests to capture the current failure**

Run: `pnpm -C apps/s3-browser/web test:run -- src/components/BucketExplorer.test.tsx src/components/ObjectBrowser.test.tsx`
Expected: FAIL because the shared test setup is not present yet and current state behavior is not fully covered.

- [ ] **Step 4: Add the S3 Browser web Vitest setup**

Use the same baseline pattern as Admin web:

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

- [ ] **Step 5: Re-run the focused S3 Browser web tests**

Run: `pnpm -C apps/s3-browser/web test:run -- src/components/BucketExplorer.test.tsx src/components/ObjectBrowser.test.tsx`
Expected: tests execute and fail only on real component behavior gaps.

- [ ] **Step 6: Commit the harness fix**

```bash
git add apps/s3-browser/web/package.json pnpm-lock.yaml apps/s3-browser/web/src/test/setup.ts apps/s3-browser/web/vitest.config.ts apps/s3-browser/web/src/components/BucketExplorer.test.tsx apps/s3-browser/web/src/components/ObjectBrowser.test.tsx
git commit -m "test: add s3 browser web vitest setup"
```

### Task 2: Normalize standalone S3 Browser routing and page states

**Files:**
- Modify: `apps/s3-browser/web/src/App.tsx`
- Create: `apps/s3-browser/web/src/App.test.tsx`
- Modify: `apps/s3-browser/web/src/layouts/ConnectionLayout.tsx`
- Create: `apps/s3-browser/web/src/layouts/ConnectionLayout.test.tsx`
- Modify: `apps/s3-browser/web/src/pages/Dashboard.tsx`
- Modify: `apps/s3-browser/web/src/pages/BucketList.tsx`
- Create: `apps/s3-browser/web/src/pages/BucketList.test.tsx`
- Modify: `apps/s3-browser/web/src/pages/ObjectBrowserPage.tsx`
- Create: `apps/s3-browser/web/src/pages/ObjectBrowserPage.test.tsx`
- Modify: `apps/s3-browser/web/src/components/BucketExplorer.tsx`
- Modify: `apps/s3-browser/web/src/components/ObjectBrowser.tsx`

- [ ] **Step 1: Turn the failing component tests into concrete acceptance checks**

Add assertions for:
- loading state copy and structure;
- empty/error state copy and structure;
- breadcrumb/reset behavior;
- hidden mutation controls in read-only embedded mode.

- [ ] **Step 2: Add failing standalone-page tests for routing and page state behavior**

Cover at least:

```tsx
it('uses the configured basename for protected routes');
it('renders ConnectionLayout loading and error states');
it('redirects BucketList directly when a connection has a fixed bucket');
it('renders ObjectBrowserPage empty and error states cleanly');
```

- [ ] **Step 3: Run the focused tests again before implementation**

Run: `pnpm -C apps/s3-browser/web test:run -- src/components/BucketExplorer.test.tsx src/components/ObjectBrowser.test.tsx src/App.test.tsx src/layouts/ConnectionLayout.test.tsx src/pages/BucketList.test.tsx src/pages/ObjectBrowserPage.test.tsx`
Expected: FAIL on current UI/state mismatches.

- [ ] **Step 4: Implement the minimal standalone S3 fixes**

Implementation rules:
- preserve existing features;
- keep basename routing stable for standalone and proxied deployments;
- normalize only the visibly inconsistent migration states;
- avoid changing the MF embed contract;
- if `ObjectBrowserPage.tsx` or `ObjectBrowser.tsx` gains more responsibilities while fixing states, extract shared view logic rather than enlarging either file further.

- [ ] **Step 5: Re-run the focused tests**

Run: `pnpm -C apps/s3-browser/web test:run -- src/components/BucketExplorer.test.tsx src/components/ObjectBrowser.test.tsx src/App.test.tsx src/layouts/ConnectionLayout.test.tsx src/pages/BucketList.test.tsx src/pages/ObjectBrowserPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run S3 Browser web typecheck**

Run: `pnpm -C apps/s3-browser/web typecheck`
Expected: PASS.

- [ ] **Step 7: Smoke-check the standalone app manually with explicit fixture prerequisites**

Run: `pnpm dev:s3`
Prerequisites:
- a reachable S3-compatible endpoint;
- credentials supplied via a manual test connection or local fixture endpoint;
- at least one writable test bucket for upload/folder/delete validation.

Verify:
- `http://localhost:5174/login` loads;
- sign-in works;
- connection create/update/delete all work;
- bucket browsing works for the configured test connection;
- upload, download, folder creation, and delete all work against the writable test bucket;
- connection detail routes do not show broken layout or stale controls.

- [ ] **Step 8: Smoke-check the standalone MF remote surface**

With `pnpm dev:s3` still running, verify:

```bash
curl -I http://localhost:5174/remoteEntry.js
```

Expected: `200 OK`, proving the standalone S3 Browser still exposes the Module Federation remote entry that Admin consumes in side-by-side deployments.

- [ ] **Step 9: Commit the standalone S3 Browser fixes**

```bash
git add apps/s3-browser/web/src/App.tsx apps/s3-browser/web/src/App.test.tsx apps/s3-browser/web/src/layouts/ConnectionLayout.tsx apps/s3-browser/web/src/layouts/ConnectionLayout.test.tsx apps/s3-browser/web/src/pages/Dashboard.tsx apps/s3-browser/web/src/pages/BucketList.tsx apps/s3-browser/web/src/pages/BucketList.test.tsx apps/s3-browser/web/src/pages/ObjectBrowserPage.tsx apps/s3-browser/web/src/pages/ObjectBrowserPage.test.tsx apps/s3-browser/web/src/components/BucketExplorer.tsx apps/s3-browser/web/src/components/ObjectBrowser.tsx
git commit -m "fix: stabilize standalone s3 browser flows"
```

## Chunk 3: Combined Runtime, MF Contract, And Deployment Wiring

### Task 1: Make the Admin host remote-entry path configurable with a safe combined default

**Files:**
- Create: `apps/admin/web/src/lib/mf-config.ts`
- Create: `apps/admin/web/src/lib/mf-config.test.ts`
- Modify: `apps/admin/web/vite.config.ts`
- Modify: `docker/admin.Dockerfile`
- Modify: `docker/combined.Dockerfile`

- [ ] **Step 1: Write the failing remote-entry resolver tests**

Cover at least:

```ts
it('uses /s3-browser/remoteEntry.js when no override is provided');
it('uses the provided remote entry override as-is');
```

- [ ] **Step 2: Run the new resolver tests**

Run: `pnpm -C apps/admin/web test:run -- src/lib/mf-config.test.ts`
Expected: FAIL because the resolver helper does not exist yet.

- [ ] **Step 3: Implement the resolver helper and wire it into `vite.config.ts`**

Rules:
- default stays `/s3-browser/remoteEntry.js`;
- build-time override name is `VITE_S3_BROWSER_REMOTE_ENTRY`, and Docker build args must forward it into Admin web builds;
- do not widen the runtime contract beyond a build-time env override;
- keep dev proxy behavior unchanged.

- [ ] **Step 4: Re-run the resolver tests and rebuild Admin web**

Run:
- `pnpm -C apps/admin/web test:run -- src/lib/mf-config.test.ts`
- `pnpm -C apps/admin/web build`
- `VITE_S3_BROWSER_REMOTE_ENTRY=https://example.invalid/remoteEntry.js pnpm -C apps/admin/web build`
- `rg -n "example\\.invalid/remoteEntry\\.js" apps/admin/web/dist`

Expected: PASS, and the override build leaves a traceable remote entry string in the built output.

- [ ] **Step 5: Commit the host config change**

```bash
git add apps/admin/web/src/lib/mf-config.ts apps/admin/web/src/lib/mf-config.test.ts apps/admin/web/vite.config.ts docker/admin.Dockerfile docker/combined.Dockerfile
git commit -m "fix: make admin remote entry configurable"
```

### Task 2: Package combined mode as one Admin shell with an internal S3 API runtime

**Files:**
- Modify: `docker/combined.Dockerfile`
- Create: `docker/combined-entrypoint.sh`
- Modify: `apps/admin/api/src/index.ts`
- Modify: `apps/s3-browser/api/src/index.ts`

- [ ] **Step 1: Build and run the current combined image to confirm the baseline**

Run:

```bash
docker build -t garage-admin-combined:plan-baseline -f docker/combined.Dockerfile .
docker run --rm --name garage-admin-combined-plan-baseline -p 3001:3001 \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  garage-admin-combined:plan-baseline
```

Then check:
- `curl -I http://localhost:3001/s3-browser/remoteEntry.js`
- `curl -sS -H 'Accept: text/html' -D /tmp/combined-baseline-s3-root.headers http://localhost:3001/s3-browser/ -o /tmp/combined-baseline-s3-root.body`
- `curl -sS -H 'Accept: text/html' -D /tmp/combined-baseline-s3-connections.headers http://localhost:3001/s3-browser/connections -o /tmp/combined-baseline-s3-connections.body`
- `docker exec garage-admin-combined-plan-baseline wget -qO- http://127.0.0.1:3002/api/health`

Expected: baseline proves the current image does not provide the intended internal S3 runtime and/or route boundaries.

- [ ] **Step 2: Implement combined runtime orchestration**

Implementation rules:
- package production dependencies for both Admin API and S3 Browser API;
- start S3 Browser API on internal port `3002`;
- start Admin API on external port `3001`;
- keep `tini` as PID 1;
- serve only Admin SPA as the user-facing shell;
- copy only remote MF assets needed for embedding under `/s3-browser/`, specifically `remoteEntry.js` and dependent `assets/`, while excluding `index.html`;
- copy any S3 Browser migration assets needed for startup, including `apps/s3-browser/api/drizzle/`, if migrations remain part of the boot path.

- [ ] **Step 3: Rebuild the combined image**

Run: `docker build -t garage-admin-combined:local -f docker/combined.Dockerfile .`
Expected: PASS.

- [ ] **Step 4: Run the combined image locally**

Run:

```bash
docker run --rm --name garage-admin-combined-plan -p 3001:3001 \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  garage-admin-combined:local
```

Expected:
- Admin API starts on `3001`;
- internal S3 Browser API starts on `3002` inside the container;
- no second external product entrypoint is exposed.

- [ ] **Step 5: Prove the packaged topology and route boundaries**

Run:
- `docker exec garage-admin-combined-plan wget -qO- http://127.0.0.1:3002/api/health`
- `curl -I http://localhost:3001/s3-browser/remoteEntry.js`
- `curl -sS -H 'Accept: text/html' -D /tmp/combined-s3-root.headers http://localhost:3001/s3-browser/ -o /tmp/combined-s3-root.body`
- `curl -sS -H 'Accept: text/html' -D /tmp/combined-s3-connections.headers http://localhost:3001/s3-browser/connections -o /tmp/combined-s3-connections.body`

Expected:
- internal `3002` health returns JSON `status: ok`;
- `/s3-browser/remoteEntry.js` returns `200 OK`;
- `/s3-browser/` does not return `200 OK` and its body does not contain `<title>S3 Browser</title>`;
- `/s3-browser/connections` does not return `200 OK` and its body does not contain `<title>S3 Browser</title>`, proving no standalone S3 Browser SPA route tree is exposed.

- [ ] **Step 6: Commit the combined runtime packaging**

```bash
git add docker/combined.Dockerfile docker/combined-entrypoint.sh apps/admin/api/src/index.ts apps/s3-browser/api/src/index.ts
git commit -m "fix: run embedded s3 services in combined deployment"
```

### Task 3: Harden the combined bridge/proxy behavior against the packaged topology

**Files:**
- Modify: `apps/admin/api/src/config/env.ts`
- Modify: `apps/admin/api/src/routes/s3-api-proxy.ts`
- Modify: `apps/admin/api/src/routes/s3-bridge.ts`
- Create: `apps/admin/api/src/test/s3-api-proxy.test.ts`
- Create: `apps/admin/api/src/test/s3-bridge.test.ts`

- [ ] **Step 1: Extend the failing Admin API route tests for combined-mode assumptions**

Add coverage for:

```ts
it('uses the configured S3 Browser API base for proxying');
it('does not return ambiguous success when upstream S3 Browser is unreachable');
it('keeps bridge connection naming stable for reuse across reconnects');
```

- [ ] **Step 2: Run the focused Admin API tests**

Run: `pnpm -C apps/admin/api test:run -- src/test/s3-api-proxy.test.ts src/test/s3-bridge.test.ts`
Expected: FAIL until the env/proxy assumptions are explicit.

- [ ] **Step 3: Implement the minimal combined topology hardening**

Rules:
- keep `S3_BROWSER_API_URL` as the single source of truth for Admin API integration;
- consume the combined-image default established in `docker/combined.Dockerfile`, not ad hoc route logic;
- keep error responses deterministic and actionable.

- [ ] **Step 4: Re-run the focused tests and the full Admin API suite**

Run:
- `pnpm -C apps/admin/api test:run -- src/test/s3-api-proxy.test.ts src/test/s3-bridge.test.ts`
- `pnpm -C apps/admin/api test:run`

Expected: PASS.

- [ ] **Step 5: Verify the combined shell route boundaries manually**

With the combined container running:
- `curl -I http://localhost:3001/s3-browser/remoteEntry.js`
  Expected: `200 OK`
- `curl -sS -H 'Accept: text/html' -D /tmp/combined-boundary-root.headers http://localhost:3001/s3-browser/ -o /tmp/combined-boundary-root.body`
  Expected: not `200 OK`, and the body does not contain `<title>S3 Browser</title>`
- `curl -sS -H 'Accept: text/html' -D /tmp/combined-boundary-connections.headers http://localhost:3001/s3-browser/connections -o /tmp/combined-boundary-connections.body`
  Expected: not `200 OK`, and the body does not contain `<title>S3 Browser</title>`
- `curl -I http://localhost:3001/api/health`
  Expected: `200 OK`

- [ ] **Step 6: Smoke-check the packaged `/s3-api` and bridge path when integration prerequisites are available**

Prerequisites:
- the combined container is running;
- Admin has a registered test cluster pointing at a reachable Garage Admin API;
- you know one valid `clusterId`, `bucketId`, and `accessKeyId` for the embedded object-browser path.

Run:

```bash
ADMIN_TOKEN=$(curl -s http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"change-me-admin-password"}' | jq -r '.token')

BRIDGE_JSON=$(curl -s http://localhost:3001/api/s3-bridge/<clusterId>/connect \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"bucketId":"<bucketId>","accessKeyId":"<accessKeyId>"}')

S3_TOKEN=$(printf '%s' "$BRIDGE_JSON" | jq -r '.token')
CONNECTION_ID=$(printf '%s' "$BRIDGE_JSON" | jq -r '.connectionId')

curl -s "http://localhost:3001/s3-api/s3/$CONNECTION_ID/buckets" \
  -H "Authorization: Bearer $S3_TOKEN"
```

Expected:
- bridge returns a connection id and S3 token;
- the `/s3-api/*` request succeeds through Admin into the internal S3 Browser API;
- repeating the bridge call for the same inputs reuses the existing `connectionId` instead of creating duplicates.

- [ ] **Step 7: Commit the combined bridge/proxy hardening**

```bash
git add apps/admin/api/src/config/env.ts apps/admin/api/src/routes/s3-api-proxy.ts apps/admin/api/src/routes/s3-bridge.ts apps/admin/api/src/test/s3-api-proxy.test.ts apps/admin/api/src/test/s3-bridge.test.ts
git commit -m "fix: harden combined admin to s3 runtime wiring"
```

## Chunk 4: Cross-Cutting UI Consistency, Docs, And Final Verification

### Task 1: Normalize the remaining migration inconsistencies without redesign

**Files:**
- Modify: `apps/admin/web/src/pages/Dashboard.tsx`
- Modify: `apps/admin/web/src/components/cluster/BucketObjectBrowserCard.tsx`
- Modify: `apps/s3-browser/web/src/pages/Dashboard.tsx`
- Modify: `apps/s3-browser/web/src/pages/BucketList.tsx`
- Modify: `apps/s3-browser/web/src/pages/ObjectBrowserPage.tsx`
- Modify: `apps/s3-browser/web/src/components/BucketExplorer.tsx`
- Modify: `apps/s3-browser/web/src/components/ObjectBrowser.tsx`

- [ ] **Step 1: Create a concrete inconsistency checklist before editing**

Persist a short checklist in the implementation notes or status log, using only issues that are
already present and migration-related, for example:
- mismatched loading indicator structure between peer pages;
- error/empty state spacing and visual hierarchy drift;
- read-only vs writable embedded controls that do not visually align with standalone states.

- [ ] **Step 2: Implement the smallest possible normalization pass**

Rules:
- no new features;
- no navigation redesign;
- no component extraction unless it removes an active responsibility tangle;
- keep changes limited to already-affected pages and components.

- [ ] **Step 3: Re-run the focused web tests**

Run:
- `pnpm -C apps/admin/web test:run -- src/components/MFErrorBoundary.test.tsx src/components/cluster/BucketObjectBrowserCard.test.tsx`
- `pnpm -C apps/s3-browser/web test:run -- src/components/BucketExplorer.test.tsx src/components/ObjectBrowser.test.tsx`

Expected: PASS.

- [ ] **Step 4: Run both frontend typechecks**

Run:
- `pnpm -C apps/admin/web typecheck`
- `pnpm -C apps/s3-browser/web typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the UI normalization**

```bash
git add apps/admin/web/src/pages/Dashboard.tsx apps/admin/web/src/components/cluster/BucketObjectBrowserCard.tsx apps/s3-browser/web/src/pages/Dashboard.tsx apps/s3-browser/web/src/pages/BucketList.tsx apps/s3-browser/web/src/pages/ObjectBrowserPage.tsx apps/s3-browser/web/src/components/BucketExplorer.tsx apps/s3-browser/web/src/components/ObjectBrowser.tsx
git commit -m "fix: align migrated admin and s3 browser ui states"
```

### Task 2: Update the deployment and Module Federation docs to match reality

**Files:**
- Modify: `docs/deployment.md`
- Modify: `docs/module-federation.md`
- Modify: `README.md`
- Modify: `README_zh.md`

- [ ] **Step 1: Update deployment documentation**

Document:
- standalone Admin expectations;
- standalone S3 Browser expectations;
- combined runtime model with internal S3 API process;
- the rule that combined mode exposes no standalone S3 Browser shell.

- [ ] **Step 2: Update Module Federation documentation**

Document:
- default remote entry path;
- build-time override path for external S3 Browser integration;
- combined-mode asset-serving boundary;
- `/s3-api` same-origin proxy contract.

- [ ] **Step 3: Update the high-level READMEs**

Document in both `README.md` and `README_zh.md`:
- what “combined” means now;
- that S3 Browser remains independently deployable but is hidden as a product shell in combined mode;
- any operator-facing build/deploy caveat for external S3 Browser remote entry overrides.

- [ ] **Step 4: Re-read the edited docs for consistency**

Run:
- `sed -n '1,260p' docs/deployment.md`
- `sed -n '1,320p' docs/module-federation.md`
- `sed -n '1,220p' README.md`
- `sed -n '1,220p' README_zh.md`

Expected: wording matches the approved spec and the implemented runtime behavior.

- [ ] **Step 5: Commit the docs updates**

```bash
git add docs/deployment.md docs/module-federation.md README.md README_zh.md
git commit -m "docs: document standalone and combined deployment behavior"
```

### Task 3: Run the final verification matrix before completion

**Files:**
- Test: `apps/admin/api/src/test/*.test.ts`
- Test: `apps/admin/web/src/components/**/*.test.tsx`
- Test: `apps/s3-browser/web/src/components/**/*.test.tsx`
- Test: `playwright.config.ts`

- [ ] **Step 1: Run static validation**

Run:

```bash
pnpm -C apps/admin/api test:run
pnpm -C apps/admin/web test:run
pnpm -C apps/s3-browser/web test:run
pnpm -C apps/admin/api build
pnpm -C apps/admin/web build
pnpm -C apps/s3-browser/api build
pnpm -C apps/s3-browser/web build
pnpm typecheck
pnpm lint
```

Expected: PASS. If any command is too broad for the current diff, record the narrower command actually used and why.

- [ ] **Step 2: Re-verify standalone Admin manually**

Run: `pnpm dev:admin`
Verify:
- login works;
- Dashboard and cluster routes load;
- bucket detail object-browser card degrades cleanly when S3 integration is absent.

- [ ] **Step 3: Re-verify standalone S3 Browser manually**

Run: `pnpm dev:s3`
Verify:
- login works;
- connection dashboard is clean;
- connection create/update/delete work;
- bucket/object routes render with normalized states;
- upload/download/folder/delete work for the writable test bucket from Chunk 2.

- [ ] **Step 4: Rebuild the final combined image before manual verification**

Run:

```bash
docker build -t garage-admin-combined:final-check -f docker/combined.Dockerfile .
```

Expected: PASS, and the image includes the latest Admin and embedded-S3 frontend/backend artifacts from Chunk 4.

- [ ] **Step 5: Re-verify combined mode manually**

Run the freshly rebuilt combined container:

```bash
docker run --rm --name garage-admin-combined-final-check -p 3001:3001 \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  garage-admin-combined:final-check
```

Prerequisites:
- reachable Garage Admin API with a test cluster registered in Admin;
- `S3_BROWSER_API_URL` baked into the combined image as `http://127.0.0.1:3002/api` or equivalent internal address;
- a Garage key with bucket access sufficient for the embedded object-browser scenario.

Verify:
- Admin shell loads at `http://localhost:3001`;
- remote assets load from `/s3-browser/*`;
- `GET /s3-browser/` and `GET /s3-browser/connections` with `Accept: text/html` do not return `200 OK` and do not render the standalone S3 Browser HTML shell;
- embedded object-browser flow works when Garage and S3 bridge prerequisites are configured.

- [ ] **Step 6: Run the existing Playwright Admin surface when prerequisites are present**

Run, when the Garage test fixture env vars are available:

```bash
npx playwright test e2e/auth.spec.ts e2e/cluster.spec.ts
```

Expected: PASS. If the Garage fixture is unavailable, record the exact missing prerequisite and do
not claim this check ran.

- [ ] **Step 7: Commit any final verification-only cleanup and rerun the affected checks**

If verification requires a final code or docs adjustment:
- stage only the files changed during that adjustment;
- rerun the smallest verification subset that proves the cleanup did not regress the touched area;
- then commit with a scoped message such as:

```bash
git add <exact files changed during final verification cleanup>
git commit -m "chore: finalize deployment hardening verification"
```

If verification does not require any additional file changes, skip this commit and skip the rerun.

- [ ] **Step 8: Record any residual limitations**

If something cannot be fully automated, write the exact remaining manual prerequisite in the final status update and docs. Do not hide it.
