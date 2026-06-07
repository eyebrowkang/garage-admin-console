# Changelog

## [1.1.0](https://github.com/eyebrowkang/garage-admin-console/compare/s3-browser-v1.0.0...s3-browser-v1.1.0) (2026-06-07)


### Features

* installable PWAs with transparent JWT token refresh ([#32](https://github.com/eyebrowkang/garage-admin-console/issues/32)) ([e23b279](https://github.com/eyebrowkang/garage-admin-console/commit/e23b279ef4b70e0402dbc2cd7e5cf01c3770a5b0))
* Phase 2 — harden /download streaming + &gt;5 GiB multipart copy (Bucket API) ([#36](https://github.com/eyebrowkang/garage-admin-console/issues/36)) ([4724d44](https://github.com/eyebrowkang/garage-admin-console/commit/4724d44c05f17529dcde1ee7c42d327603efe29a))
* Phase 3 — adaptive multipart part size + S3_MULTIPART_* config ([#37](https://github.com/eyebrowkang/garage-admin-console/issues/37)) ([a1c61ba](https://github.com/eyebrowkang/garage-admin-console/commit/a1c61bade9bf4f0f3492b402f1d22cb481b0919b))
* Phase 5 (final) — resumable uploads + CORS diagnostics ([#39](https://github.com/eyebrowkang/garage-admin-console/issues/39)) ([9301dd3](https://github.com/eyebrowkang/garage-admin-console/commit/9301dd3117bb8d8caa1c53e177cb285d64949b34))
* **s3-browser:** harden large-file uploads (Phase 1 reliability) ([#35](https://github.com/eyebrowkang/garage-admin-console/issues/35)) ([08edfd6](https://github.com/eyebrowkang/garage-admin-console/commit/08edfd60bedc350252e548f0e652aebc116f17ad))
* **s3-browser:** pause/resume uploads + per-part status ([#46](https://github.com/eyebrowkang/garage-admin-console/issues/46)) ([f6aadaf](https://github.com/eyebrowkang/garage-admin-console/commit/f6aadafe15fb11aa98a051e5eb1781dd3a3b81a2))
* **s3-browser:** Phase 4 — background upload manager + non-blocking panel ([#38](https://github.com/eyebrowkang/garage-admin-console/issues/38)) ([cd9c025](https://github.com/eyebrowkang/garage-admin-console/commit/cd9c02535ea22634e73f8895648c9b613f457195))


### Bug Fixes

* **bucket-api:** scope auto-CORS to a concrete origin, never a wildcard ([#43](https://github.com/eyebrowkang/garage-admin-console/issues/43)) ([9421f49](https://github.com/eyebrowkang/garage-admin-console/commit/9421f49e5228e8251e96208e97222911e96dfeb9))
* **s3-browser:** default control-plane timeout + recurring presign re-sign ([#45](https://github.com/eyebrowkang/garage-admin-console/issues/45)) ([e719d78](https://github.com/eyebrowkang/garage-admin-console/commit/e719d78573e96250e3418255857b25c35fd45b7e))
* **s3-browser:** store upload-sessions key separator as \0 escape, not raw NUL ([#40](https://github.com/eyebrowkang/garage-admin-console/issues/40)) ([9b9563f](https://github.com/eyebrowkang/garage-admin-console/commit/9b9563f02a427fd54143efa33189c98f056fbfcb))

## 1.0.0 (2026-06-05)

First stable release of S3 Browser — a generic S3-protocol file browser that
runs standalone or embeds into the Garage Admin Console via Module Federation.

### Features

* **File operations** — browse, upload (multipart), download, delete, rename, move, copy, and create folders against any S3-compatible endpoint
* **Presigned URLs** — generate time-limited shareable links for any object
* **Preview pane** — inline preview for images, text, and common file types
* **Tree navigation** — collapsible folder tree sidebar with breadcrumb bar
* **List & grid views** — toggle between table and card layouts; responsive mobile layout
* **Bulk actions** — multi-select files for batch delete, move, copy, and download
* **Module Federation remote** — exposes `FileBrowser` as an MF 2.0 remote, embeddable into the Garage Admin Console or any MF host ([#17](https://github.com/eyebrowkang/garage-admin-console/issues/17)) ([e56df0f](https://github.com/eyebrowkang/garage-admin-console/commit/e56df0f1b595c9d21bbed3ba888cecea7e6cee59))
* **Standalone deployment** — own BFF (Express) + SPA; Docker image with non-root user and HEALTHCHECK
* **Auto-managed bucket CORS** — scoped to the app origin, configurable via `S3_CORS_ALLOWED_ORIGINS` / `S3_MANAGE_CORS` ([07c66b3](https://github.com/eyebrowkang/garage-admin-console/commit/07c66b332cd449604540175f93ad42beda9fa8d0))

### Security

* Set security response headers on BFF ([80e41f4](https://github.com/eyebrowkang/garage-admin-console/commit/80e41f4256684a194ff091661489bb2c6bdd514e))
* AES-256-GCM encrypted credential storage; JWT authentication
* BFF proxy pattern — frontend never touches S3 credentials directly
