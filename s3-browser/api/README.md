# @s3-browser/api

S3 Browser BFF.

## What it does

- Stores user-supplied S3 connection credentials, encrypted at rest with AES-256-GCM.
- Implements the **Bucket Backend API** contract (see `designs/mf-integration-plan.md` §2.4) under `/api/connections/:connId/buckets/:bucket/*`. Any frontend that implements the §2.5 `FileBrowserProps` contract can talk to it.
- Issues JWTs for standalone login.

## Running

```bash
pnpm -C s3-browser/api dev   # tsx watch on PORT (default 3002)
```

Required env vars (see `.env.example`):

- `JWT_SECRET` — auth tokens.
- `ENCRYPTION_KEY` — exactly 32 bytes, encrypts stored S3 credentials.
- `ADMIN_PASSWORD` — single account, mirrors `@garage-admin/api`.

## Endpoints

| Path                                           | Auth | Purpose                                                   |
| ---------------------------------------------- | ---- | --------------------------------------------------------- |
| `POST /api/auth/login`                         | none | exchange password → JWT                                   |
| `GET /api/health`                              | none | health check                                              |
| `GET/POST/PUT/DELETE /api/connections[/:id]`   | JWT  | CRUD S3 connections (tokens excluded from list responses) |
| `GET /api/connections/:connId/buckets`         | JWT  | list buckets via S3 ListBuckets (extra; not in §2.4)      |
| `* /api/connections/:connId/buckets/:bucket/*` | JWT  | Bucket Backend API (§2.4)                                 |

See `designs/mf-integration-plan.md` for the full architectural contract.
