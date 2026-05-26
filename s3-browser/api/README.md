# @s3-browser/api

S3 Browser BFF.

**Tech stack**: Express 5, TypeScript, Drizzle ORM, SQLite/LibSQL, Zod, Pino, Morgan, `@aws-sdk/client-s3`, busboy.

## What it does

- Stores user-supplied S3 connection credentials, encrypted at rest with AES-256-GCM ([`src/encryption.ts`](src/encryption.ts) — bit-identical to the Admin BFF's).
- Implements the **Bucket Backend API** under `/api/connections/:connId/buckets/:bucket/*`. Any frontend that consumes the `FileBrowserProps` surface can talk to it — that's what `s3-browser/web` does in standalone mode.
- Issues JWTs for standalone login.

The Admin Console BFF (`@garage-admin/api`) implements the SAME HTTP surface under `/api/clusters/:clusterId/buckets/:bucket/*`. The shared regression suite at `packages/bucket-api-contract-tests/` exercises both, so the two implementations stay in sync.

## Endpoints

| Path                                                                                                 | Auth | Purpose                                                        |
| ---------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------- |
| `POST /api/auth/login`                                                                               | none | Exchange password → JWT                                        |
| `GET /api/health`                                                                                    | none | Health check                                                   |
| `GET/POST/PUT/DELETE /api/connections[/:id]`                                                         | JWT  | CRUD S3 connections (credentials excluded from list responses) |
| `GET /api/connections/:connId/buckets`                                                               | JWT  | S3 `ListBuckets` (helper)                                      |
| `GET/POST/DELETE /api/connections/:connId/buckets/:bucket/{list,object,presign,upload,objects,copy}` | JWT  | Bucket Backend API                                             |

## Running

```bash
pnpm -C s3-browser/api dev      # tsx watch — default port 3002
pnpm -C s3-browser/api build
pnpm -C s3-browser/api start
pnpm -C s3-browser/api typecheck
```

Required env vars (see [`.env.example`](.env.example)):

- `JWT_SECRET` — auth tokens.
- `ENCRYPTION_KEY` — exactly 32 bytes, encrypts stored S3 credentials.
- `ADMIN_PASSWORD` — single account, mirrors `@garage-admin/api`.
- `PORT` (optional) — defaults to `3002`.

## Docker

`docker/s3-browser.Dockerfile` builds the full S3 Browser product image: BFF API, standalone SPA, and MF remote assets.

```bash
docker build -f docker/s3-browser.Dockerfile -t s3-browser .
docker run -p 3002:3002 \
  -v s3-browser-data:/data \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  s3-browser
```

For embedded Admin deployments, run the same image with `S3_BROWSER_STATIC_ONLY=true`. In that mode it only serves the built SPA/MF remote and skips API env validation, migrations, and DB access.

## Database

Schema in [`src/db/schema.ts`](src/db/schema.ts):

- **`Connection`** — `id, name, endpoint, region, forcePathStyle, accessKeyId (enc), secretAccessKey (enc), createdAt, updatedAt`
- **`AppSettings`** — key/value store

Migrations under [`drizzle/`](drizzle/) run automatically on startup.

## Conformance

Run the shared `@garage/bucket-api-contract-tests` suite against this BFF:

```bash
export TEST_BFF_URL=http://localhost:3002/api
export TEST_BFF_PASSWORD=admin
export TEST_CONNECTION_ID=<connection id from /api/connections>
export TEST_S3_BUCKET=s3-browser-test
pnpm -C packages/bucket-api-contract-tests test:run
```

If `TEST_CONNECTION_ID` is unset, the suite creates a throwaway connection from `TEST_S3_*` env vars and deletes it on teardown.

## Documentation

See [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md).
