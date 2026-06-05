# Changelog

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
