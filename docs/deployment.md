# Deployment

[English](./deployment.md) | [中文](./deployment_zh.md)

Docker is the supported deployment path. The build is intentionally composable:

- **Admin-only** — run the Admin Console image by itself. Bucket pages keep
  working and show a fallback if the S3 Browser remote is absent.
- **Standalone S3 Browser** — run the S3 Browser image by itself; it serves its
  own API, SPA, and MF remote.
- **Embedded combined** — run both images. Admin receives `S3_BROWSER_MF_URL` at
  runtime and proxies `/s3-browser/*` to the S3 Browser container, so only the
  Admin port needs to be published.
- **All-in-one (`garage-admin-all`)** — a single image: the Admin Console with the
  S3 Browser remote bundled in and served same-origin at `/s3-browser` (no proxy
  hop, no separate container). The simplest embedded setup — one container, only
  the Admin secrets. The embedded FileBrowser's data still flows through the Admin
  BFF, exactly as in combined mode. The `/s3-browser` path is a Module Federation
  remote for Admin, not a standalone S3 Browser entry point.

Dockerfiles, the Compose file, and build-context ignores live under `docker/`.

## Docker Compose (combined)

```bash
cp docker/.env.compose.example docker/.env
# Edit docker/.env — change every secret before starting
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

With the default profile, Admin is at **http://localhost:3001** and proxies the
S3 Browser remote at **/s3-browser/mf-manifest.json**; the S3 Browser container
stays internal to the Compose network. Minimum secrets:

| Variable                      | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| `GARAGE_ADMIN_JWT_SECRET`     | Random string for Admin JWT signing                 |
| `GARAGE_ADMIN_ENCRYPTION_KEY` | Exactly 32 characters for Admin AES-256 storage     |
| `GARAGE_ADMIN_PASSWORD`       | Admin Console login password                        |
| `S3_BROWSER_MF_URL`           | Browser-visible URL to the S3 Browser manifest      |
| `S3_BROWSER_MF_PROXY_TARGET`  | Compose-internal S3 Browser URL for the Admin proxy |

`COMPOSE_PROFILES=` runs Admin-only; `COMPOSE_PROFILES=s3-browser` runs the S3
Browser image in `S3_BROWSER_STATIC_ONLY=true` mode (MF/static assets only).
Data persists in named Docker volumes (SQLite databases).

## Docker run (single images)

```bash
docker build -f docker/garage-admin-console.Dockerfile -t garage-admin-console .
docker run -d -p 3001:3001 -v garage-data:/data \
  -e JWT_SECRET=change-me -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me garage-admin-console

# All-in-one: Admin Console + the embedded S3 Browser remote, served same-origin
# (one container, no proxy). Same three secrets as Admin-only.
docker build -f docker/garage-admin-all.Dockerfile -t garage-admin-all .
docker run -d -p 3001:3001 -v garage-data:/data \
  -e JWT_SECRET=change-me -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me garage-admin-all

# Standalone S3 Browser uses one image too:
docker build -f docker/s3-browser.Dockerfile -t s3-browser .
docker run -d -p 3002:3002 -v s3-browser-data:/data \
  -e JWT_SECRET=change-me -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me s3-browser
```

The Admin image is multi-stage (`node:24-alpine`): it builds `@garage/tokens` +
`@garage/ui`, compiles the Admin API and Vite frontend, then `pnpm deploy`s a
standalone API directory. Express serves the SPA from `/app/static/` with SPA
fallback; migrations run automatically on startup. The S3 Browser image runs the
API + standalone SPA/MF remote by default, or serves only static/MF assets when
`S3_BROWSER_STATIC_ONLY=true`.

## Production env vars (Admin image)

| Variable                     | Required | Default       | Description                                                                                                                              |
| ---------------------------- | -------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                 | Yes      | —             | Secret for JWT signing                                                                                                                   |
| `ENCRYPTION_KEY`             | Yes      | —             | AES-256 key (exactly 32 characters)                                                                                                      |
| `ADMIN_PASSWORD`             | Yes      | —             | Console login password                                                                                                                   |
| `PORT`                       | No       | `3001`        | Server port                                                                                                                              |
| `LOG_LEVEL`                  | No       | `info`        | Log level                                                                                                                                |
| `DATA_DIR`                   | No       | `/data`       | Directory for the SQLite database                                                                                                        |
| `STATIC_DIR`                 | No       | `/app/static` | Directory for frontend files                                                                                                             |
| `S3_BROWSER_MF_URL`          | No       | —             | Browser-visible MF manifest URL                                                                                                          |
| `S3_BROWSER_MF_PROXY_TARGET` | No       | —             | Internal upstream for Admin's `/s3-browser/*` proxy                                                                                      |
| `S3_BROWSER_STATIC_DIR`      | No       | —             | Serve the bundled S3 Browser remote same-origin from this dir (baked into the `garage-admin-all` image; takes precedence over the proxy) |
| `S3_CORS_ALLOWED_ORIGINS`    | No       | —             | Comma-separated origins for the auto-managed bucket CORS rule (default: the requesting app's origin)                                     |
| `S3_MANAGE_CORS`             | No       | `true`        | Set `false` to leave bucket CORS entirely to the operator                                                                                |
| `MORGAN_FORMAT`              | No       | off (prod)    | HTTP access log format (`combined`, `common`, `dev`, etc.); `off` / `none` / `false` disables                                            |

## Production env vars (S3 Browser image)

The S3 Browser image shares the same core env vars (`JWT_SECRET`, `ENCRYPTION_KEY`,
`ADMIN_PASSWORD`, `PORT`, `LOG_LEVEL`, `DATA_DIR`, `STATIC_DIR`, `MORGAN_FORMAT`)
as the Admin image. The following are specific to the S3 Browser:

| Variable                  | Required | Default | Description                                                                   |
| ------------------------- | -------- | ------- | ----------------------------------------------------------------------------- |
| `S3_BROWSER_STATIC_ONLY`  | No       | `false` | `true` serves only static/MF assets (no BFF API); used in combined deployment |
| `STATIC_CORS_ORIGIN`      | No       | —       | Allowed CORS origin for static assets in `S3_BROWSER_STATIC_ONLY` mode        |
| `S3_CORS_ALLOWED_ORIGINS` | No       | —       | Comma-separated origins for the auto-managed bucket CORS rule                 |
| `S3_MANAGE_CORS`          | No       | `true`  | Set `false` to leave bucket CORS entirely to the operator                     |

> The `S3_CORS_*` vars are read by both the Admin and S3 Browser BFFs.

## Production env vars (all-in-one image)

The `garage-admin-all` image bakes in the same env vars as the Admin image with
two additional defaults pre-configured:

| Variable                | Baked default                  | Description                                                            |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `S3_BROWSER_STATIC_DIR` | `/app/s3-browser-static`       | Serves the bundled S3 Browser remote same-origin (no proxy needed)     |
| `S3_BROWSER_MF_URL`     | `/s3-browser/mf-manifest.json` | Browser-visible MF manifest path (same-origin, no separate URL needed) |

Only the three core secrets (`JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD`)
are required — no S3 Browser container or proxy configuration.

### Using the all-in-one image

Use `garage-admin-all` through the Admin Console:

1. Open the Admin Console URL, for example `http://localhost:3001`.
2. Add a Garage cluster with the Garage Admin API endpoint, for example
   `http://garage:3903`.
3. Set the cluster's S3 endpoint separately, for example `http://garage:3900`.
   If it is left blank, the Admin API derives Garage's default S3 port from the
   Admin endpoint.
4. Open a bucket detail page and use the embedded object browser there.

Do not open `/s3-browser` directly in the all-in-one image to create S3
connections. That path serves static Module Federation assets for the Admin
Console. The standalone S3 Browser connection workflow requires the separate
S3 Browser image, which provides its own `/api/connections` API.

## Production notes

- Deploy behind a reverse proxy with HTTPS.
- Use strong, unique `JWT_SECRET` / `ENCRYPTION_KEY` / `ADMIN_PASSWORD` per BFF.
- **Rotating `ENCRYPTION_KEY`:** it encrypts stored secrets at rest (cluster admin
  tokens; S3 keypairs). There is no automatic re-encryption, so changing the key
  makes existing rows undecryptable — proxied calls and the object browser then
  error. To rotate: stop the service, set the new key, and re-enter the affected
  credentials (edit each cluster/connection to set its token or keypair again,
  which re-encrypts it under the new key). Plan a maintenance window; for many
  rows treat it as a re-provisioning.
- The console targets internal-network deployment; consider an extra auth layer
  (VPN, SSO) for production.
- If you statically host the Admin SPA elsewhere (not via the BFF), set
  `VITE_S3_BROWSER_MF_URL` **before** the web build.

## Troubleshooting

**Adding an S3 connection in all-in-one returns 404** → You are probably using the
standalone S3 Browser UI against the Admin API. The all-in-one image does not run
the standalone S3 Browser BFF, so requests such as `/api/connections` and
`/api/connections/test` are not available. Use the Admin Console bucket detail
page for embedded object browsing, or run the standalone S3 Browser image if you
want to manage S3 connections directly.

**Garage logs `Forbidden: Garage does not support anonymous access yet` for
`GET /`** → This is often a health check or reverse proxy probe hitting the
Garage S3 endpoint without a signature. The Admin Console's object browser sends
signed S3 requests through the BFF path; check the browser Network tab for the
actual failing request URL before treating this log line as the application
failure.
