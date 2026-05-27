import type { S3Client } from '@aws-sdk/client-s3';
import type { Request } from 'express';

export interface BucketContext {
  client: S3Client;
  bucketName: string;
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
