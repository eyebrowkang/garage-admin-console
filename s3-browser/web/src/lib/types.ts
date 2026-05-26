/**
 * Shared type definitions for @s3-browser/web.
 */

export interface Connection {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  // Optional bucket scope — set when the credentials lack ListBuckets.
  bucket?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface S3Object {
  key: string;
  size: number;
  etag: string;
  lastModified: string | null;
  storageClass: string | null;
}

export interface ListResult {
  objects: S3Object[];
  prefixes: string[];
  nextContinuationToken?: string;
}

export interface UploadResult {
  uploaded: { key: string; etag: string; size: number }[];
}

export interface DeleteResult {
  deleted: string[];
  errors: { key: string; message: string }[];
}

export interface PresignResult {
  url: string;
  expiresAt: string;
}

export interface Bucket {
  name: string;
  creationDate: string | null;
}
