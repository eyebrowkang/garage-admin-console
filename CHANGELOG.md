# Changelog

## v2.0.0 — Initial Release

First stable release of Garage Admin Console.

### Features

- **Multi-cluster management** — connect and manage multiple Garage clusters from a single interface
- **Dashboard** — real-time cluster health, node status, and capacity visualizations
- **Bucket management** — create, configure, and delete buckets with quota and website hosting options
- **Access key management** — generate, import, and manage S3-compatible access keys
- **Permission control** — fine-grained bucket-key permission matrix with read/write/owner toggles
- **Node monitoring** — view node status, statistics, and trigger maintenance operations
- **Layout management** — configure cluster topology with staged changes and preview before apply
- **Block operations** — monitor block errors, retry failed syncs, and manage data integrity
- **Worker management** — monitor background workers and configure performance parameters
- **Admin token management** — manage API tokens with scoped permissions

### Security

- AES-256-GCM encrypted storage for Garage admin tokens
- JWT authentication with 24-hour token expiry
- BFF proxy pattern — frontend never communicates directly with Garage clusters

### Infrastructure

- Monorepo with pnpm workspaces (API + Web)
- Single Docker image for production deployment
- Prisma with SQLite/LibSQL for data persistence
- Compatible with Garage Admin API v2
