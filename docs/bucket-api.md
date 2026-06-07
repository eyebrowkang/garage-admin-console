# Bucket Backend API

The shared HTTP surface that **both** BFFs implement so the same `FileBrowser`
can run against either. The logic lives once in
[`@garage/bucket-api-server`](../packages/bucket-api-server/) as a
`createBucketRouter(resolveContext)` factory; each BFF supplies a `resolveContext`
that maps a request to an `{ client: S3Client, bucketName }` pair.

## Scope prefix

Routes are relative to a per-bucket scope:

- **Admin BFF:** `/api/clusters/:clusterId/buckets/:bucket/...`
- **S3 Browser BFF:** `/api/connections/:connId/buckets/:bucket/...`

All routes require `Authorization: Bearer <jwt>`. The error envelope is
`{ error: string | Issue[] }` (Zod issues for validation failures).

## The threshold split

The 10 MiB `LARGE_FILE_THRESHOLD_BYTES` constant (from
[`@garage/bucket-api-server`](../packages/bucket-api-server/)) splits the surface
in two:

- **Below the threshold** — small files upload through `POST /upload` and
  download through `GET /download`. The BFF proxies the bytes; S3 credentials
  never reach the browser. `POST /upload` rejects oversized files with **413**.
- **At or above the threshold** — uploads use `POST /multipart/*` and downloads
  use a presigned `getObject` URL; the browser talks to the S3 endpoint directly.
  On the first such request per `(endpoint, bucket)`, the BFF idempotently
  appends a CORS rule (`AllowedMethods:['GET','PUT','HEAD','POST']`,
  `AllowedHeaders:['*']`, `ExposeHeaders:['ETag']`, `MaxAgeSeconds:3000`) without
  disturbing pre-existing rules — and, if it can't _read_ the existing rules, it
  skips the update rather than clobber them. `AllowedOrigins` defaults to the
  requesting app's origin; set `S3_CORS_ALLOWED_ORIGINS` (comma-separated) to pin
  explicit origins, or `S3_MANAGE_CORS=false` to leave bucket CORS to the operator.

## Routes (relative to the bucket scope)

| Method + path              | Body / query                                                             | Response                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /list`                | `?prefix=&delimiter=/&continuationToken=&maxKeys=`                       | `{ objects: S3Object[]; prefixes: string[]; nextContinuationToken? }`                                                                                                                                                                                                                                                        |
| `GET /object`              | `?key=`                                                                  | `S3Object` (HEAD-equivalent metadata)                                                                                                                                                                                                                                                                                        |
| `GET /download`            | `?key=` (optional `Range` header)                                        | Binary stream — `Content-Disposition: attachment`. Honours `Range` (→ `206` + `Content-Range` + `Accept-Ranges`). Streamed via `stream.pipeline`, so a mid-stream upstream error destroys the response (truncated, never a short body read as complete) and a client disconnect tears the S3 read down instead of leaking it |
| `POST /presign`            | `{ key, operation, expiresIn, responseContentDisposition? }`             | `{ url, expiresAt }`                                                                                                                                                                                                                                                                                                         |
| `POST /upload`             | `multipart/form-data` (one+ files, optional `prefix`); per-file ≤ 10 MiB | `{ uploaded: { key, etag, size }[] }` · 413 `{ error, limit, uploaded }` if any file exceeds the limit (the files that fit are still stored + reported)                                                                                                                                                                      |
| `POST /multipart/create`   | `{ key, contentType? }`                                                  | `{ uploadId, key, partSize, maxParts }`                                                                                                                                                                                                                                                                                      |
| `POST /multipart/sign`     | `{ key, uploadId, partNumbers: number[], expiresIn? }`                   | `{ urls: { partNumber, url }[], expiresAt }`                                                                                                                                                                                                                                                                                 |
| `POST /multipart/complete` | `{ key, uploadId, parts: { partNumber, etag }[] }`                       | `{ key, etag, location }`                                                                                                                                                                                                                                                                                                    |
| `POST /multipart/abort`    | `{ key, uploadId }`                                                      | `{ ok: true }`                                                                                                                                                                                                                                                                                                               |
| `DELETE /objects`          | `{ keys: string[] }`                                                     | `{ deleted: string[]; errors: { key, message }[] }`                                                                                                                                                                                                                                                                          |
| `POST /copy`               | `{ src, dst }`                                                           | `{ etag }` · `404` if `src` is missing. Sources ≤ 5 GiB use a single `CopyObject`; larger sources fall back to a server-side multipart copy (`CreateMultipartUpload` + ranged `UploadPartCopy` + `CompleteMultipartUpload`, source content metadata carried over), so copy/move/rename work past the 5 GiB single-copy limit |

## Extending the API

Because the surface is shared, additions/changes flow through the shared package:

1. Implement in [`@garage/bucket-api-server`](../packages/bucket-api-server/)
   (`createBucketRouter`); both BFFs pick it up automatically.
2. Cover the new shape in
   [`packages/bucket-api-contract-tests`](../packages/bucket-api-contract-tests/)
   — that's how the two BFFs stay in lockstep.
3. Update the federated `FileBrowser`
   ([`s3-browser/web/src/file-browser/`](../s3-browser/web/src/file-browser/))
   to consume it.
4. For breaking changes (rename/remove fields), treat it as a `feat`/breaking
   change per [CONTRIBUTING.md](../CONTRIBUTING.md#versioning) so downstream
   embedders can pin.

## Conformance suite

The same set of HTTP cases runs against **either** BFF via `TEST_BFF_FLAVOR`. It
is env-gated, so `pnpm test` stays offline-safe. Full env reference and the
auto-create-connection flow are in the
[suite README](../packages/bucket-api-contract-tests/README.md); see also
[testing.md](./testing.md#live-testing-against-a-real-cluster).

```bash
# Against the S3 Browser BFF (connections flavor — default)
export TEST_BFF_URL=http://localhost:3002/api TEST_BFF_PASSWORD=admin
export TEST_S3_BUCKET=s3-browser-test
export TEST_S3_ENDPOINT=http://<host>:3900 TEST_S3_ACCESS_KEY=… TEST_S3_SECRET_KEY=…
pnpm -C packages/bucket-api-contract-tests test:run

# Against the Admin BFF (clusters flavor)
export TEST_BFF_URL=http://localhost:3001/api TEST_BFF_PASSWORD=admin
export TEST_BFF_FLAVOR=clusters
export TEST_CLUSTER_ID=<id from /api/clusters>   # cluster must have s3Endpoint set
export TEST_ACCESS_KEY_ID=<key authorized on the bucket>
export TEST_S3_BUCKET=s3-browser-test
pnpm -C packages/bucket-api-contract-tests test:run
```
