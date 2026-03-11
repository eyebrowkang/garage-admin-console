# S3 Browser

A web-based management interface for S3-compatible object storage. Think of it as a web UI for `aws s3` CLI — connect to any S3-compatible endpoint and browse, upload, download, and delete objects.

## Features

- **Multi-connection management** — Save multiple S3 endpoints with encrypted credentials
- **Bucket browsing** — List all accessible buckets, or bookmark a specific bucket
- **Object browser** — Navigate folders, view file sizes and timestamps, sort by columns
- **File upload** — Drag-and-drop multi-file upload with per-file progress bars
- **Streaming uploads** — Uses `@aws-sdk/lib-storage` for automatic multipart upload (up to 5 GB)
- **Download & delete** — Download files directly, delete with confirmation
- **Folder management** — Create folders (S3 prefix markers)
- **Secure credentials** — Access keys encrypted at rest with AES-256-GCM

## Quick Start

### Using Docker

```bash
docker build -t s3-browser -f docker/s3-browser.Dockerfile .

docker run -d \
  -p 3002:3002 \
  -v s3-data:/data \
  -e JWT_SECRET=change-me-to-a-random-string \
  -e ENCRYPTION_KEY=change-me-exactly-32-characters! \
  -e ADMIN_PASSWORD=change-me-admin-password \
  s3-browser
```

Access at **http://localhost:3002**.

### Development

```bash
# Configure environment
cp apps/s3-browser/api/.env.example apps/s3-browser/api/.env
# Edit .env with your settings

# Start S3 Browser only
pnpm dev:s3

# Or start all apps
pnpm dev
```

- API: http://localhost:3002
- Web: http://localhost:5174

## Connection Configuration

Each connection stores the following:

| Field | Required | Description |
|-------|----------|-------------|
| Name | Yes | Display name for the connection |
| Endpoint | Yes | S3-compatible endpoint URL (e.g. `http://garage:3900`) |
| Region | No | AWS region (default: `garage` for Garage, `us-east-1` for AWS) |
| Access Key ID | Yes | S3 access key (encrypted at rest) |
| Secret Access Key | Yes | S3 secret key (encrypted at rest) |
| Bucket | No | Pre-selected bucket — skips bucket list on connect |
| Path Style | No | Use path-style URLs (required for Garage, MinIO) |

> **Tip:** If you only need access to one bucket, set the **Bucket** field to skip the bucket selection step.

## API Routes

All routes require JWT authentication (except login and health check).

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with admin password, returns JWT |

### Connection Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/connections` | List all connections (secrets excluded) |
| POST | `/api/connections` | Create a new connection |
| PUT | `/api/connections/:id` | Update a connection |
| DELETE | `/api/connections/:id` | Delete a connection |

### S3 Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/s3/:connectionId/buckets` | List accessible buckets |
| GET | `/api/s3/:connectionId/objects` | List objects (query: `bucket`, `prefix`) |
| GET | `/api/s3/:connectionId/objects/download` | Download an object (query: `bucket`, `key`) |
| POST | `/api/s3/:connectionId/objects/upload` | Upload file(s) via multipart form |
| DELETE | `/api/s3/:connectionId/objects` | Delete an object (query: `bucket`, `key`) |
| POST | `/api/s3/:connectionId/objects/folder` | Create a folder (body: `bucket`, `prefix`) |

### Upload Details

- **Multipart streaming**: Files are streamed directly from HTTP request to S3 using `busboy` + `@aws-sdk/lib-storage` — no memory buffering
- **Automatic multipart**: Files >10 MB are automatically split into parts with 4 concurrent uploads
- **Size limit**: Up to 5 GB per file
- **Progress tracking**: Frontend uses `XMLHttpRequest` upload progress events for real-time per-file progress bars

## Frontend Routes

| Path | Page | Description |
|------|------|-------------|
| `/login` | Login | Password authentication |
| `/` | Dashboard | Connection list with add/edit/delete |
| `/connections/:id` | Bucket List | Browse buckets for a connection |
| `/connections/:id/browse` | Object Browser | Browse objects (query: `bucket`, `prefix`) |

## Embedded Mode (Module Federation)

S3 Browser components can be embedded in the Admin Console via Module Federation. See [Module Federation Guide](./module-federation.md) for details.

When embedded, the components:
- Receive connection config from `S3EmbedProvider` context
- Create their own `QueryClientProvider` (independent of host)
- Support `readonly` mode to disable mutations
- Authenticate using the provided JWT token
