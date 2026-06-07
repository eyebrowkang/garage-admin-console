# Changelog

## [2.4.0](https://github.com/eyebrowkang/garage-admin-console/compare/v2.3.0...v2.4.0) (2026-06-07)


### Features

* installable PWAs with transparent JWT token refresh ([#32](https://github.com/eyebrowkang/garage-admin-console/issues/32)) ([e23b279](https://github.com/eyebrowkang/garage-admin-console/commit/e23b279ef4b70e0402dbc2cd7e5cf01c3770a5b0))
* Phase 2 — harden /download streaming + &gt;5 GiB multipart copy (Bucket API) ([#36](https://github.com/eyebrowkang/garage-admin-console/issues/36)) ([4724d44](https://github.com/eyebrowkang/garage-admin-console/commit/4724d44c05f17529dcde1ee7c42d327603efe29a))
* Phase 3 — adaptive multipart part size + S3_MULTIPART_* config ([#37](https://github.com/eyebrowkang/garage-admin-console/issues/37)) ([a1c61ba](https://github.com/eyebrowkang/garage-admin-console/commit/a1c61bade9bf4f0f3492b402f1d22cb481b0919b))
* Phase 5 (final) — resumable uploads + CORS diagnostics ([#39](https://github.com/eyebrowkang/garage-admin-console/issues/39)) ([9301dd3](https://github.com/eyebrowkang/garage-admin-console/commit/9301dd3117bb8d8caa1c53e177cb285d64949b34))


### Bug Fixes

* **bucket-api:** scope auto-CORS to a concrete origin, never a wildcard ([#43](https://github.com/eyebrowkang/garage-admin-console/issues/43)) ([9421f49](https://github.com/eyebrowkang/garage-admin-console/commit/9421f49e5228e8251e96208e97222911e96dfeb9))


### Performance Improvements

* **bucket-api:** spool small proxy uploads in memory, disk only as fallback ([#44](https://github.com/eyebrowkang/garage-admin-console/issues/44)) ([91b7f7a](https://github.com/eyebrowkang/garage-admin-console/commit/91b7f7af117586dabd769cbb3b03b50d4b013946))

## [2.3.0](https://github.com/eyebrowkang/garage-admin-console/compare/v2.2.0...v2.3.0) (2026-06-06)


### Features

* support Garage v2.3.0 API fields with backward compatibility ([#30](https://github.com/eyebrowkang/garage-admin-console/issues/30)) ([d3499a0](https://github.com/eyebrowkang/garage-admin-console/commit/d3499a008217944763500748ee7fcce63c3ae82c))

## [2.2.0](https://github.com/eyebrowkang/garage-admin-console/compare/v2.1.3...v2.2.0) (2026-06-05)


### Embedded S3 File Browser

The Admin Console now optionally embeds an S3 Browser via Module Federation,
adding file browse, upload, presign, and delete capabilities to every bucket's
detail page. Three composable Docker images ship this feature:

* Embed S3 Browser via Module Federation and split into composable Docker images (`garage-admin-console`, `s3-browser`, `garage-admin-all`) ([#17](https://github.com/eyebrowkang/garage-admin-console/issues/17)) ([e56df0f](https://github.com/eyebrowkang/garage-admin-console/commit/e56df0f1b595c9d21bbed3ba888cecea7e6cee59))
* Add `garage-admin-all` single image — Admin Console + embedded S3 Browser served same-origin in one container ([09d1d38](https://github.com/eyebrowkang/garage-admin-console/commit/09d1d383ca035088628737e1f8e791712016c91b))
* Auto-manage bucket CORS rules scoped to the app origin, configurable via `S3_CORS_ALLOWED_ORIGINS` / `S3_MANAGE_CORS` ([07c66b3](https://github.com/eyebrowkang/garage-admin-console/commit/07c66b332cd449604540175f93ad42beda9fa8d0))


### UI/UX Improvements

* Redesign and polish overall UI/UX — responsive list/detail pages, ResourceList component, design tokens ([1297151](https://github.com/eyebrowkang/garage-admin-console/commit/1297151f0597d221d60400481e51b16b0bab0f56)) ([e584785](https://github.com/eyebrowkang/garage-admin-console/commit/e5847859e6f80169518ebd4b77a5d3ca01ad07c7))
* Accessibility: enlarge touch targets (44 px), improve breadcrumb, meter, and copy-value components ([6fbc052](https://github.com/eyebrowkang/garage-admin-console/commit/6fbc0521eff1507ce238c16157c1b830d53230d6))
* Fix date display: parse bare `YYYY-MM-DD` as local time, not UTC ([1270d6f](https://github.com/eyebrowkang/garage-admin-console/commit/1270d6f7d3d7c99b86d909920cb7af37bb4c4d30))
* Fix byte-size display: render em dash for non-finite or negative values ([70c3ab9](https://github.com/eyebrowkang/garage-admin-console/commit/70c3ab960274e1355bd2db00e472a254b53cd188))
* Warn when ResourceList `defaultSort.columnId` matches no column ([13d68ad](https://github.com/eyebrowkang/garage-admin-console/commit/13d68ade397666ebfbdf048e5854b591012af042))


### Bug Fixes

* **bucket-api:** don't destroy cached S3 clients that may still be streaming ([930b2e6](https://github.com/eyebrowkang/garage-admin-console/commit/930b2e6bc8db0aa4b3c3c2738d0ab3b295da80d3))
* **bucket-api-server:** correct POST /upload multi-file oversize handling ([fd95370](https://github.com/eyebrowkang/garage-admin-console/commit/fd9537075e0d6b5c297ce7b034d29b42686bcfed))
* **bucket-api-server:** reclaim idle entries from the S3-client and CORS caches ([ac0ceaf](https://github.com/eyebrowkang/garage-admin-console/commit/ac0ceafdb0391303ebc763033418597a0437844c))
* **docker:** run images as non-root and add container HEALTHCHECKs ([e43c877](https://github.com/eyebrowkang/garage-admin-console/commit/e43c87768fc5fa5e90b51c8d2c174a400e384997))
* **server-config:** harden BFF auth — pin JWT HS256, constant-time password check ([5768e0d](https://github.com/eyebrowkang/garage-admin-console/commit/5768e0d98f8b435b23ff65b4ddfa2c963ce04554))
* **server-config:** redact credentials from pino error logs ([c3de951](https://github.com/eyebrowkang/garage-admin-console/commit/c3de951bc75c46127c2d5632ce842fcb3d8c8fb5))
* Redact admin token from proxy error logs ([e9a0420](https://github.com/eyebrowkang/garage-admin-console/commit/e9a0420792950b09a5e1b0e40497d0b43d0f2484))
* Set security response headers on both BFFs ([80e41f4](https://github.com/eyebrowkang/garage-admin-console/commit/80e41f4256684a194ff091661489bb2c6bdd514e))
* Fix e2e test case ([f54548d](https://github.com/eyebrowkang/garage-admin-console/commit/f54548d52bf7743acf99e17edb606b84a8dade26))
* Fix live-tests workflow ([49549d1](https://github.com/eyebrowkang/garage-admin-console/commit/49549d10de580f6d25bbbfe857bb78176ee6d7e1))

## [2.1.3](https://github.com/eyebrowkang/garage-admin-console/compare/v2.1.2...v2.1.3) (2026-03-03)


### Bug Fixes

* add /api prefix to Express routes to prevent SPA route collisions ([#13](https://github.com/eyebrowkang/garage-admin-console/issues/13)) ([decf3b9](https://github.com/eyebrowkang/garage-admin-console/commit/decf3b9642ff32358564ed3b12cc0b7ecda3abfa))

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
