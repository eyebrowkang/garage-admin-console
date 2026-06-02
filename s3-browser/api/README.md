# @s3-browser/api

S3 Browser BFF — Express 5 + Drizzle/LibSQL.

Stores user-supplied S3 connection credentials (encrypted at rest via `@garage/crypto`) and implements the shared **[Bucket Backend API](../../docs/bucket-api.md)** under `/api/connections/:connId/buckets/:bucket/*`, plus connection CRUD and a `POST /api/connections/test` credential probe.

The Admin Console BFF (`@garage-admin/api`) implements the SAME surface under `/api/clusters/:clusterId/buckets/:bucket/*`; the [contract suite](../../packages/bucket-api-contract-tests/) exercises both so they stay in sync. Routes and the `Connection` schema are in [docs/architecture.md](../../docs/architecture.md#s3-browser-bff).

**Tech stack:** Express 5, TypeScript, Drizzle ORM + LibSQL, Zod, Pino + Morgan, `@aws-sdk/client-s3`, busboy.

## Documentation

Local dev, env, and scripts → [docs/development.md](../../docs/development.md).
Docker (incl. `S3_BROWSER_STATIC_ONLY`) → [docs/deployment.md](../../docs/deployment.md).
The Bucket Backend API + conformance recipe → [docs/bucket-api.md](../../docs/bucket-api.md).
