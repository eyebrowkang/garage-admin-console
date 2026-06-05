# Deployment

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
  BFF, exactly as in combined mode.

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

| Variable | Description |
| --- | --- |
| `GARAGE_ADMIN_JWT_SECRET` | Random string for Admin JWT signing |
| `GARAGE_ADMIN_ENCRYPTION_KEY` | Exactly 32 characters for Admin AES-256 storage |
| `GARAGE_ADMIN_PASSWORD` | Admin Console login password |
| `S3_BROWSER_MF_URL` | Browser-visible URL to the S3 Browser manifest |
| `S3_BROWSER_MF_PROXY_TARGET` | Compose-internal S3 Browser URL for the Admin proxy |

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

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `JWT_SECRET` | Yes | — | Secret for JWT signing |
| `ENCRYPTION_KEY` | Yes | — | AES-256 key (exactly 32 characters) |
| `ADMIN_PASSWORD` | Yes | — | Console login password |
| `PORT` | No | `3001` | Server port |
| `LOG_LEVEL` | No | `info` | Log level |
| `DATA_DIR` | No | `/data` | Directory for the SQLite database |
| `STATIC_DIR` | No | `/app/static` | Directory for frontend files |
| `S3_BROWSER_MF_URL` | No | — | Browser-visible MF manifest URL |
| `S3_BROWSER_MF_PROXY_TARGET` | No | — | Internal upstream for Admin's `/s3-browser/*` proxy |
| `S3_BROWSER_STATIC_DIR` | No | — | Serve the bundled S3 Browser remote same-origin from this dir (baked into the `garage-admin-all` image; takes precedence over the proxy) |
| `S3_CORS_ALLOWED_ORIGINS` | No | — | Comma-separated origins for the auto-managed bucket CORS rule (default: the requesting app's origin) |
| `S3_MANAGE_CORS` | No | `true` | Set `false` to leave bucket CORS entirely to the operator |

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
