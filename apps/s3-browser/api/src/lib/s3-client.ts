import { S3Client } from '@aws-sdk/client-s3';

interface S3ConnectionConfig {
  endpoint: string;
  region: string | null;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle: boolean;
}

export function createS3Client(config: S3ConnectionConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region || 'us-east-1',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.pathStyle,
  });
}
