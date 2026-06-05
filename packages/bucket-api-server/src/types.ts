import type { S3Client } from '@aws-sdk/client-s3';
import type { Request } from 'express';

export interface BucketContext {
  client: S3Client;
  bucketName: string;
  /**
   * Stable identity for the resolved S3 endpoint/bucket pair. Used to cache
   * idempotent setup operations (CORS rules) across requests. Resolvers should
   * include the actual endpoint and only non-secret client identity fields; if
   * omitted, the bucket name is used.
   */
  cacheKey?: string;
}

export type ResolveContextFn = (req: Request) => Promise<BucketContext>;

export interface S3Object {
  key: string;
  size: number;
  etag: string;
  lastModified: string | null;
  storageClass: string | null;
  contentType?: string | null;
}

export interface Logger {
  error(bindings: Record<string, unknown>, msg: string): void;
}

export class BucketAccessError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'BucketAccessError';
  }
}
