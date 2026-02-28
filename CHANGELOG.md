# Changelog

## [2.1.2](https://github.com/eyebrowkang/garage-admin-console/compare/v2.1.1...v2.1.2) (2026-02-28)


### Bug Fixes

* correct connect-cluster-nodes payload and refresh README docs ([#10](https://github.com/eyebrowkang/garage-admin-console/issues/10)) ([6b5a8a8](https://github.com/eyebrowkang/garage-admin-console/commit/6b5a8a81439a5736094271c15ed9af8d33234a1b))

## [2.1.1](https://github.com/eyebrowkang/garage-admin-console/compare/v2.1.0...v2.1.1) (2026-02-26)


### Bug Fixes

* **ci:** add --repo flag to gh pr list in ci-status job ([#9](https://github.com/eyebrowkang/garage-admin-console/issues/9)) ([f219035](https://github.com/eyebrowkang/garage-admin-console/commit/f219035ca6d7d3e97e0c0f59fa25af6eba013705))
* **ci:** chain release workflow from release-please via workflow_call ([#5](https://github.com/eyebrowkang/garage-admin-console/issues/5)) ([6acdd30](https://github.com/eyebrowkang/garage-admin-console/commit/6acdd300b9b747ef06c380bd59296fcd02436057))
* **ci:** pass tag_name to release workflow for Docker tag generation ([#6](https://github.com/eyebrowkang/garage-admin-console/issues/6)) ([0af1c54](https://github.com/eyebrowkang/garage-admin-console/commit/0af1c54ae5361390d72230e02116cf0e9bac2b69))
* **ci:** post CI status on release PRs to satisfy branch protection ([#8](https://github.com/eyebrowkang/garage-admin-console/issues/8)) ([3ca0362](https://github.com/eyebrowkang/garage-admin-console/commit/3ca0362185d887f6a655cf208e9fb62306785a3f))
* **ci:** revert to commit status API for release PR checks ([ae5787d](https://github.com/eyebrowkang/garage-admin-console/commit/ae5787db47ccb0f3207218b2feec40498a9a6e9f))

## [2.1.0](https://github.com/eyebrowkang/garage-admin-console/compare/v2.0.0...v2.1.0) (2026-02-26)


### Refactors

* migrate from Prisma to Drizzle ORM ([#1](https://github.com/eyebrowkang/garage-admin-console/issues/1)) ([58e9cfb](https://github.com/eyebrowkang/garage-admin-console/commit/58e9cfb924efefda5a125ce144e7edd37407734f))


### Bug Fixes

* resolve UI issues and clarify Conventional Commits requirement ([#2](https://github.com/eyebrowkang/garage-admin-console/issues/2)) ([5dbd463](https://github.com/eyebrowkang/garage-admin-console/commit/5dbd46345587c29432d5085282f7957a4b77dc94))


### Miscellaneous

* optimize Docker image — switch to Alpine, reduce size from ~438MB to ~215MB ([#1](https://github.com/eyebrowkang/garage-admin-console/issues/1)) ([58e9cfb](https://github.com/eyebrowkang/garage-admin-console/commit/58e9cfb924efefda5a125ce144e7edd37407734f))

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
- Drizzle ORM with SQLite/LibSQL for data persistence
- Compatible with Garage Admin API v2
