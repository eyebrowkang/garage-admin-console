# Deployment Guide

Three Docker deployment modes are available, each with its own Dockerfile in the `docker/` directory.

## Deployment Modes

| Mode | Dockerfile | Description | Port |
|------|-----------|-------------|------|
| **Admin Only** | `docker/admin.Dockerfile` | Garage cluster management console | 3001 |
| **S3 Browser Only** | `docker/s3-browser.Dockerfile` | Standalone S3 object browser | 3002 |
| **Combined** | `docker/combined.Dockerfile` | Both apps in one image, with MF integration | 3001 |

## Environment Variables

### Required (all modes)

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Random string for JWT signing (32+ characters recommended) |
| `ENCRYPTION_KEY` | Exactly 32 ASCII characters for AES-256-GCM encryption |
| `ADMIN_PASSWORD` | Login password for the console |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` (admin/combined), `3002` (s3-browser) | Server port |
| `LOG_LEVEL` | `info` | Log level: fatal, error, warn, info, debug, trace, silent |
| `DATA_DIR` | `/data` | Directory for SQLite database files |
| `STATIC_DIR` | `/app/static` | Directory for frontend static files |

### Combined Mode Only

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_BROWSER_STATIC_DIR` | `/app/static/s3-browser` | S3 Browser remote assets directory |

### S3 Browser Bridge (Admin + Combined)

For the integrated Object Browser in bucket detail pages, set these on the Admin API:

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_BROWSER_API_URL` | — | S3 Browser API URL (e.g. `http://localhost:3002/api`) |
| `S3_BROWSER_ADMIN_PASSWORD` | `ADMIN_PASSWORD` | Password for S3 Browser login |

In the **combined** Docker image, set `S3_BROWSER_API_URL` to `http://localhost:3002/api` (internal). In **side-by-side** deployments, point to the S3 Browser container's API URL.

## Docker Compose Examples

### Admin Console Only

The simplest deployment — just the Garage cluster management console:

```yaml
services:
  garage-admin-console:
    image: ghcr.io/eyebrowkang/garage-admin-console:latest
    # To build locally:
    #   build:
    #     context: .
    #     dockerfile: docker/admin.Dockerfile
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

Access at **http://localhost:3001**.

### S3 Browser Only

Standalone S3-compatible object storage browser — no Garage dependency:

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

Access at **http://localhost:3002**.

### Combined Deployment

Both apps in one image. The Admin Console can embed S3 Browser components via Module Federation:

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
      - S3_BROWSER_API_URL=http://localhost:3002/api
    restart: unless-stopped

volumes:
  combined-data:
```

Access at **http://localhost:3001**. S3 Browser remote assets are served from `/s3-browser/` on the same origin.

### Side-by-Side Deployment

Run both apps independently on separate ports:

```yaml
services:
  admin-console:
    build:
      context: .
      dockerfile: docker/admin.Dockerfile
    ports:
      - '3001:3001'
    volumes:
      - admin-data:/data
    environment:
      - JWT_SECRET=change-me-jwt-secret-for-admin
      - ENCRYPTION_KEY=change-me-exactly-32-characters!
      - ADMIN_PASSWORD=change-me-admin-password
      - S3_BROWSER_API_URL=http://s3-browser:3002/api
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

> **Note:** Each app has its own database, JWT secret, and login password. For the Object Browser bridge, the admin console needs the S3 Browser's API URL and password.

## Data Persistence

SQLite databases are stored in the `DATA_DIR` directory (`/data` by default). Always mount a volume to persist data across container restarts.

| App | Database File | Contents |
|-----|--------------|----------|
| Admin | `data.db` | Cluster configurations, encrypted admin tokens |
| S3 Browser | `s3-browser.db` | Connection configurations, encrypted access keys |

## Production Recommendations

- Deploy behind a reverse proxy (Nginx, Caddy) with HTTPS
- Use strong, unique values for all secrets
- Consider VPN or additional auth layers for internet-facing deployments
- The apps are designed for internal network use

### Reverse Proxy Example (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name admin.example.com;

    ssl_certificate     /etc/ssl/certs/admin.crt;
    ssl_certificate_key /etc/ssl/private/admin.key;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for file uploads
        client_max_body_size 5G;
    }
}
```

## Building Docker Images

```bash
# Admin only
docker build -t garage-admin -f docker/admin.Dockerfile .

# S3 Browser only
docker build -t s3-browser -f docker/s3-browser.Dockerfile .

# Combined
docker build -t garage-admin-combined -f docker/combined.Dockerfile .
```

All builds use multi-stage Dockerfiles: a `node:24-alpine` build stage compiles TypeScript and builds the frontend, then a slim production stage copies only the necessary artifacts.
