# @garage/bucket-api-server

The shared Express router behind the
[Bucket Backend API](../../docs/bucket-api.md) — both BFFs mount it, so the
contract is implemented exactly once.

```ts
import { createBucketRouter } from '@garage/bucket-api-server';
const router = createBucketRouter({ resolveContext, logger });
```

`resolveContext(req)` maps a request to `{ client: S3Client, bucketName, cacheKey? }`;
`cacheKey` should include the resolved S3 endpoint, bucket, and non-secret
connection identity fields. Use `createBucketCorsCacheKey(...)` to escape parts.
The package owns all S3, presign, multipart, lazy-CORS, and streaming-upload
logic. Also exports `getCachedS3Client`, `BucketAccessError`, and
`LARGE_FILE_THRESHOLD_BYTES` (via the `@garage/bucket-api-server/constants` entry).

To extend the contract, change it here and cover it in
[`bucket-api-contract-tests`](../bucket-api-contract-tests/) — see
[docs/bucket-api.md](../../docs/bucket-api.md#extending-the-api).
