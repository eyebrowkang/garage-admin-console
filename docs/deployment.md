# Deployment Guide

This project ships three Docker deployment modes. They share the same monorepo, but they do not
all expose the same product surface.

## Deployment Modes

| Mode | Dockerfile | What Users See | Exposed Port |
|------|------------|----------------|--------------|
| `admin` | `docker/admin.Dockerfile` | Admin Console only | `3001` |
| `s3-browser` | `docker/s3-browser.Dockerfile` | Standalone S3 Browser shell | `3002` |
| `combined` | `docker/combined.Dockerfile` | Admin Console shell with embedded S3 capability | `3001` |

## Runtime Model

### Admin Only

- runs the Admin API and Admin SPA;
- can optionally embed S3 Browser if you point it at an external S3 Browser deployment;
- does not include an internal S3 Browser API process.

### S3 Browser Only

- runs the S3 Browser API and standalone S3 Browser SPA;
- exposes the standalone shell at `/`;
- also serves the MF remote entry at `/remoteEntry.js`.

### Combined

- runs two backend processes inside one container:
  - Admin API on `3001`
  - internal S3 Browser API on `3002`
- serves the Admin SPA as the only user-facing shell;
- exposes S3 Browser Module Federation assets under `/s3-browser/`;
- does **not** expose the standalone S3 Browser route tree in the browser shell.

In combined mode, these requests are expected:

| Request | Expected Result |
|---------|-----------------|
| `GET /` | Admin Console HTML shell |
| `GET /s3-browser/remoteEntry.js` | `200 OK` |
| `GET /s3-browser/assets/...` | `200 OK` |
| `GET /s3-browser/` | `404 Not Found` |
| `GET /s3-browser/connections` | `404 Not Found` |
| `GET /s3-api/api/health` | proxied JSON response from the internal S3 Browser API |

## Environment Variables

### Required In All Modes

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | JWT signing secret. Use a long random string. |
| `ENCRYPTION_KEY` | Exactly 32 ASCII characters for AES-256-GCM encryption. |
| `ADMIN_PASSWORD` | Login password for the running shell or API. |

### Common Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `/data` | Directory that stores SQLite database files. |
| `PORT` | `3001` for Admin/Combined, `3002` for standalone S3 Browser | External listen port for the main process. |
| `STATIC_DIR` | image-specific | Directory that serves frontend static files. |
| `LOG_LEVEL` | `info` | Admin API log level. Supported values: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. |

### Admin Integration Variables

These are consumed by the Admin API whenever it needs to bridge into S3 Browser.

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_BROWSER_API_URL` | empty in `admin`, `http://127.0.0.1:3002` in `combined` | Base URL for the S3 Browser API. Do **not** append `/api`. |
| `S3_BROWSER_ADMIN_PASSWORD` | `ADMIN_PASSWORD` | Password the Admin API uses when logging into S3 Browser. |
| `S3_BROWSER_STATIC_DIR` | `/app/static/s3-browser` in `combined` | Directory that serves MF remote assets only. |
| `S3_BROWSER_PORT` | `3002` in `combined` | Internal listen port for the embedded S3 Browser API process. |

## Docker Compose Examples

### Admin Console Only

```yaml
services:
  garage-admin-console:
    build:
      context: .
      dockerfile: docker/admin.Dockerfile
    ports:
      - '3001:3001'
    volumes:
      - admin-data:/data
    environment:
      - JWT_SECRET=change-me-to-a-random-string
      - ENCRYPTION_KEY=change-me-exactly-32-characters!
      - ADMIN_PASSWORD=change-me-admin-password
    restart: unless-stopped

volumes:
  admin-data:
```

Access the shell at `http://localhost:3001`.

### S3 Browser Only

```yaml
services:
  s3-browser:
    build:
      context: .
      dockerfile: docker/s3-browser.Dockerfile
    ports:
      - '3002:3002'
    volumes:
      - s3-data:/data
    environment:
      - JWT_SECRET=change-me-to-a-random-string
      - ENCRYPTION_KEY=change-me-exactly-32-characters!
      - ADMIN_PASSWORD=change-me-admin-password
    restart: unless-stopped

volumes:
  s3-data:
```

Access the standalone shell at `http://localhost:3002`.

### Combined Deployment

```yaml
services:
  garage-admin:
    build:
      context: .
      dockerfile: docker/combined.Dockerfile
    ports:
      - '3001:3001'
    volumes:
      - combined-data:/data
    environment:
      - JWT_SECRET=change-me-to-a-random-string
      - ENCRYPTION_KEY=change-me-exactly-32-characters!
      - ADMIN_PASSWORD=change-me-admin-password
    restart: unless-stopped

volumes:
  combined-data:
```

Access the shell at `http://localhost:3001`.

The image already defaults `S3_BROWSER_API_URL` to the internal runtime, so you do not need to
set it unless you intentionally want to override the topology.

### Side-by-Side Deployment

Use this when Admin and S3 Browser run as separate services and Admin should still embed the
remote UI.

```yaml
services:
  admin-console:
    build:
      context: .
      dockerfile: docker/admin.Dockerfile
      args:
        VITE_S3_BROWSER_REMOTE_ENTRY: https://s3-browser.example.com/remoteEntry.js
    ports:
      - '3001:3001'
    volumes:
      - admin-data:/data
    environment:
      - JWT_SECRET=change-me-jwt-secret-for-admin
      - ENCRYPTION_KEY=change-me-exactly-32-characters!
      - ADMIN_PASSWORD=change-me-admin-password
      - S3_BROWSER_API_URL=https://s3-browser.example.com
      - S3_BROWSER_ADMIN_PASSWORD=change-me-s3-browser-password
    restart: unless-stopped

  s3-browser:
    build:
      context: .
      dockerfile: docker/s3-browser.Dockerfile
    ports:
      - '3002:3002'
    volumes:
      - s3-data:/data
    environment:
      - JWT_SECRET=change-me-jwt-secret-for-s3
      - ENCRYPTION_KEY=change-me-exactly-32-characters!
      - ADMIN_PASSWORD=change-me-s3-browser-password
    restart: unless-stopped

volumes:
  admin-data:
  s3-data:
```

Two important rules for side-by-side deployments:

1. `VITE_S3_BROWSER_REMOTE_ENTRY` is a **build-time** setting for the Admin web bundle.
2. `S3_BROWSER_API_URL` is a **runtime** setting for the Admin API and must point at the S3
   Browser base URL without `/api`.

## Data Persistence

SQLite databases live under `DATA_DIR`.

| App | Database File | Contents |
|-----|---------------|----------|
| Admin | `data.db` | Cluster definitions, encrypted Garage admin tokens, settings |
| S3 Browser | `s3-browser.db` | Saved S3 connections and encrypted credentials |

Always mount a persistent volume for `/data`.

## Sanity Checks

Use these probes after deploying:

### Admin Only

```bash
curl -I http://localhost:3001/api/health
```

Expected: `200 OK`

### S3 Browser Only

```bash
curl -I http://localhost:3002/api/health
curl -I http://localhost:3002/remoteEntry.js
```

Expected: both return `200 OK`

### Combined

```bash
curl -I http://localhost:3001/api/health
curl -I http://localhost:3001/s3-browser/remoteEntry.js
curl -sS http://localhost:3001/s3-api/api/health
curl -I http://localhost:3001/s3-browser/
curl -I http://localhost:3001/s3-browser/connections
```

Expected:

- `/api/health` returns `200 OK`
- `/s3-browser/remoteEntry.js` returns `200 OK`
- `/s3-api/api/health` returns S3 Browser health JSON
- `/s3-browser/` and `/s3-browser/connections` return `404 Not Found`

## Production Notes

- Put the apps behind HTTPS in production.
- Use strong, unique values for every secret.
- Increase reverse-proxy upload limits if you expect large object uploads.
- Treat `combined` as a convenience topology, not as a second standalone S3 product shell.

## Building Images

```bash
docker build -t garage-admin -f docker/admin.Dockerfile .
docker build -t garage-s3-browser -f docker/s3-browser.Dockerfile .
docker build -t garage-admin-combined -f docker/combined.Dockerfile .
```

To build Admin for an external S3 Browser remote:

```bash
docker build \
  --build-arg VITE_S3_BROWSER_REMOTE_ENTRY=https://s3-browser.example.com/remoteEntry.js \
  -t garage-admin \
  -f docker/admin.Dockerfile .
```
