# @garage/bucket-api-contract-tests

Regression test suite for the **Bucket Backend API** — the shared HTTP surface implemented by both BFFs in this monorepo.

Both BFFs are expected to pass this suite so the same `FileBrowser` can run against either:

- `@s3-browser/api` — exposes the surface under `/api/connections/:connId/buckets/:bucket/*` (the "connections" flavor)
- `@garage-admin/api` — exposes the surface under `/api/clusters/:clusterId/buckets/:bucket/*` (the "clusters" flavor; mints per-bucket S3 keypairs on the fly)

A single set of 12 tests runs against either flavor via the `TEST_BFF_FLAVOR` env var. When you add or change a route, update both BFFs and the cases here together so they stay in sync.

## Running

The suite is **env-gated** and skips cleanly when env vars are missing, so `pnpm test` works offline without Docker / a real S3 endpoint:

```bash
pnpm -F @garage/bucket-api-contract-tests test:run   # skips with empty env
```

### Against `@s3-browser/api` (connections flavor — default)

```bash
export TEST_BFF_URL=http://localhost:3002/api
export TEST_BFF_PASSWORD=admin
# Optional: TEST_BFF_FLAVOR=connections  (the default)

# Either point at an existing connection…
export TEST_CONNECTION_ID=<connection-id>

# …or let the suite create one for you on the fly:
# export TEST_S3_ENDPOINT=http://127.0.0.1:3900
# export TEST_S3_ACCESS_KEY=…
# export TEST_S3_SECRET_KEY=…
# export TEST_S3_REGION=garage
# export TEST_S3_FORCE_PATH_STYLE=true

export TEST_S3_BUCKET=s3-browser-test         # MUST already exist; key MUST own it

pnpm -F @garage/bucket-api-contract-tests test:run
```

### Against `@garage-admin/api` (clusters flavor)

```bash
export TEST_BFF_URL=http://localhost:3001/api
export TEST_BFF_PASSWORD=admin
export TEST_BFF_FLAVOR=clusters

# The cluster MUST already exist in the Admin DB and have its s3Endpoint set.
export TEST_CLUSTER_ID=<cluster-id-from-/api/clusters>
export TEST_S3_BUCKET=s3-browser-test

pnpm -F @garage/bucket-api-contract-tests test:run
```

Cluster auto-creation is not supported (the suite never creates/deletes cluster rows). Run `cp garage-admin-console/api/.env.example garage-admin-console/api/.env`, start the Admin BFF, add a cluster from the UI, and copy its id.

## Environment reference

| Variable                                    | Required                | Description                                                   |
| ------------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| `TEST_BFF_URL`                              | Yes                     | BFF base URL — must include `/api`.                           |
| `TEST_BFF_PASSWORD`                         | Yes                     | Password for `POST /api/auth/login`.                          |
| `TEST_S3_BUCKET`                            | Yes                     | Existing bucket the BFF's key owns.                           |
| `TEST_BFF_FLAVOR`                           | No                      | `connections` (default) or `clusters`.                        |
| `TEST_CONNECTION_ID`                        | When flavor=connections | Existing connection id. Omit to auto-create from `TEST_S3_*`. |
| `TEST_CLUSTER_ID`                           | When flavor=clusters    | Existing cluster id (auto-create not supported).              |
| `TEST_S3_ENDPOINT`                          | Auto-create only        | S3 endpoint URL.                                              |
| `TEST_S3_ACCESS_KEY` / `TEST_S3_SECRET_KEY` | Auto-create only        | S3 credentials.                                               |
| `TEST_S3_REGION`                            | No                      | Defaults to `us-east-1`.                                      |
| `TEST_S3_FORCE_PATH_STYLE`                  | No                      | Defaults to `true`.                                           |

## What the suite covers

- `GET /list` envelope shape on empty + populated prefixes
- `POST /upload` single + batched multipart
- `GET /object` HEAD-equivalent metadata + 404
- `POST /presign` getObject + putObject roundtrip via `fetch`
- `POST /copy` ETag + size verification
- `DELETE /objects` single + batched payloads
- `?continuationToken` pagination

Side-effects are scoped under `contract-test/<runId>/...` and reaped in `afterAll`, so it's safe to point the suite at a shared dev bucket. If the suite created a connection on the fly, it's deleted too.
