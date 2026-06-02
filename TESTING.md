# Testing

This repo follows the testing pyramid — **a lot of fast unit tests at the base,
a focused band of integration tests in the middle, and a few end-to-end tests at
the top** — and the frontend maxim _"Write tests. Not too many. Mostly
integration."_ Coverage is deliberately concentrated on logic and real user
flows rather than on every presentational component.

```
        ▲  E2E (Playwright)            4 specs · live Garage backend
       ███  Integration               BFF supertest · RTL component/flow
      █████ Unit                       crypto · formatters · reducer · cors …
```

## Running

```bash
pnpm test                 # full offline suite — every workspace, runs in CI
pnpm test:coverage        # aggregated v8 coverage for the pure/shared/frontend layers
pnpm -C <workspace> test  # one workspace in watch mode (e.g. pnpm -C packages/crypto test)
pnpm e2e                  # Playwright E2E (needs a running stack + a Garage cluster)
```

`pnpm test` runs `pnpm -r --if-present test:run`, so each workspace runs its own
Vitest in its own working directory. The two BFF suites isolate their LibSQL
file DB into a per-process temp dir (see each `src/test/setup.ts`), so they never
collide on a shared `data.db` even when CI sets one `DATA_DIR`.

## What lives where

| Layer | Workspace | Focus |
| --- | --- | --- |
| **Unit** | `packages/crypto` | AES-256-GCM round-trip, tamper/auth-tag rejection, key-length & empty-sentinel contract |
| | `packages/server-config` | `loadEnv` validation matrix, `getParam`, `createAuthenticateToken` |
| | `packages/web-shared` | formatters (bytes/date/relative/fileKind…), `getApiErrorMessage`, api-client interceptors, query-client retry |
| | `packages/bucket-api-server` | CORS rule reconciliation + caching, S3-client hash cache + TTL, stream upload + abort |
| | `s3-browser/web` (logic) | FileBrowser `reducer`, `runUploadJob` multipart orchestration, persistence, `connectionProvider`, `classifyError` |
| **Integration** | `garage-admin-console/api` | supertest over clusters CRUD, proxy, bucket-key resolution + log sanitization, auth login |
| | `s3-browser/api` | supertest over connections CRUD, credential probe, bucket listing (aws-sdk mocked) |
| | `packages/ui` | RTL — `LoginForm` (error mapping/disabled), `useToast` reducer, `useViewMode`, `cn` |
| | `s3-browser/web` (flow) | `FileBrowser` smoke — mounts against a mocked `/list`, renders, navigates, opens a dialog |
| **Contract** | `packages/bucket-api-contract-tests` | the shared Bucket Backend API exercised against **either** BFF — env-gated, skips offline |
| **E2E** | `e2e/` | login, cluster navigation, create bucket, create access key — Playwright against a live stack |

## Conventions

- **Test location** — server/shared packages keep tests under `src/test/**`; the
  web apps co-locate or use `src/test/**`. Vitest configs `include` these and
  the package `tsconfig.json` `exclude`s them, so tests are run by Vitest (oxc),
  never emitted into `dist` or type-checked by the build.
- **Imports** — NodeNext packages import the unit under test with a `.js`
  specifier (`../index.js`); bundler-resolution packages use extensionless paths.
- **BFF harness** — `supertest(app)` + a hand-minted JWT; migrations run in
  `beforeAll`, the table is cleared in `beforeEach`. Upstream I/O is mocked at
  its boundary: `axios` for the Garage admin API, `@garage/bucket-api-server`'s
  `createS3Client`/`getCachedS3Client` for the S3 SDK.
- **Time & timezone** — deterministic clocks via `vi.spyOn(Date, 'now')`; the
  date formatters pin `TZ=UTC` in `web-shared`'s Vitest config.
- **Frontend** — jsdom + Testing Library. `useViewMode`/persistence rely on real
  `localStorage`; the `FileBrowser` smoke stubs `matchMedia`/`ResizeObserver` and
  the react-arborist `TreePane` (which needs real layout measurement).

## Offline vs. live

`pnpm test` is fully offline and gates CI. Two suites need real infrastructure
and are intentionally kept out of it:

- **Contract tests** self-skip unless their Garage/S3 env vars are set
  (`packages/bucket-api-contract-tests`), so the offline run stays green.
- **E2E** boots `pnpm dev` and drives a browser against a configured Garage
  cluster; run it locally or in a job that provisions a backend.

## Coverage

`pnpm test:coverage` produces an aggregated v8 report (`./coverage`) for the
shared packages, `@garage/ui`, and both web apps. It is **informational, not a
gate** — the headline percentage is low by design because the suite targets
logic and key flows, not exhaustive component coverage. The BFFs are excluded
from the aggregate (each migrates its own file DB) and are covered by their
supertest suites under `pnpm test`.

## Live testing against a real cluster

The contract suite and E2E need a real Garage/S3 backend, so they are kept out
of `pnpm test`. Keep their credentials in a **gitignored** env file — anything
matching `.env.*` is ignored (only `.env.example` is tracked), so a file such as
`.env.contract.local` never enters git. Source it before running:

```bash
set -a; . ./.env.contract.local; set +a
```

### Contract suite

Runs the shared Bucket Backend API cases against a **running** BFF. Full setup
for both flavors and the complete env reference live in
[`packages/bucket-api-contract-tests/README.md`](packages/bucket-api-contract-tests/README.md).
Quick start (connections flavor — start `s3-browser/api`, then run):

```bash
# .env.contract.local  (gitignored)
TEST_BFF_URL=http://localhost:3002/api
TEST_BFF_PASSWORD=admin              # the BFF's ADMIN_PASSWORD
TEST_S3_BUCKET=s3-browser-test       # must already exist; the key below must own it
TEST_S3_ENDPOINT=http://<host>:3900
TEST_S3_ACCESS_KEY=<accessKeyId>
TEST_S3_SECRET_KEY=<secretAccessKey>
TEST_S3_REGION=garage
TEST_S3_FORCE_PATH_STYLE=true
```

```bash
pnpm -F @garage/bucket-api-contract-tests test:run
```

### E2E (Playwright)

Boots `pnpm dev` and drives the Admin Console against a cluster added through
the UI. Required env (same gitignored file):

```bash
ADMIN_PASSWORD=admin                 # matches garage-admin-console/api/.env
TEST_GARAGE_ENDPOINT=http://<host>:3903
TEST_GARAGE_ADMIN_TOKEN=<admin-token>
```

```bash
pnpm e2e
```

The bucket/key specs create uniquely-named (`*-${Date.now()}`) resources on the
target cluster and do not clean them up — point them at a disposable dev cluster.
