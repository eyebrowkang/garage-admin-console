import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

export type { S3Client } from '@aws-sdk/client-s3';

export interface S3ClientCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface S3ClientOptions {
  region: string;
  endpoint: string;
  forcePathStyle: boolean;
  credentials: S3ClientCredentials;
}

export function createS3Client({
  region,
  endpoint,
  forcePathStyle,
  credentials,
}: S3ClientOptions): S3Client {
  const config: S3ClientConfig = {
    region,
    endpoint,
    forcePathStyle,
    credentials,
    // AWS SDK v3 defaults to adding a CRC32 checksum on uploads. Keep this
    // opt-in for S3-compatible endpoints; the upload route already provides
    // a concrete ContentLength so AWS S3 doesn't need chunked checksum mode.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };

  return new S3Client(config);
}
