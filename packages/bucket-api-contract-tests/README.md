# @garage/bucket-api-contract-tests

Conformance test suite for the **Bucket Backend API** (see `designs/mf-integration-plan.md` §2.4).

Any BFF that hosts a `/api/connections/:connId/buckets/:bucket/*` surface MUST pass this suite. Today that's `@s3-browser/api`; when Admin Console mints per-bucket keypairs in a future phase, `@garage-admin/api` will too.

## Running

The suite is **env-gated**. With no env vars set, it skips cleanly so `pnpm test` works offline:

```bash
pnpm -F @garage/bucket-api-contract-tests test:run   # skips
```

To actually run it, point at a live BFF that's already wired to an S3 endpoint:

```bash
export TEST_BFF_URL=http://localhost:3002/api
export TEST_BFF_PASSWORD=admin

# The connection + bucket the BFF will hit. Either supply an existing
# connection ID via TEST_CONNECTION_ID, or supply credentials so the
# suite can create one on the fly.
export TEST_CONNECTION_ID=…                    # OR …
export TEST_S3_ENDPOINT=http://192.168.88.62:3900
export TEST_S3_ACCESS_KEY=…
export TEST_S3_SECRET_KEY=…
export TEST_S3_REGION=garage

export TEST_S3_BUCKET=s3-browser-test          # MUST already exist; key MUST own it

pnpm -F @garage/bucket-api-contract-tests test:run
```

The suite runs against a per-run prefix (`contract-test/<runId>/...`) and cleans up its keys in `afterAll`, so it's safe to point at a shared dev bucket.
