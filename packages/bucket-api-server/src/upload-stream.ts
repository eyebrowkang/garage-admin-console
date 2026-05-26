import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PutObjectCommand, type PutObjectCommandOutput, type S3Client } from '@aws-sdk/client-s3';

interface UploadStreamToS3Input {
  client: S3Client;
  bucket: string;
  key: string;
  body: NodeJS.ReadableStream;
  contentType?: string | undefined;
}

interface UploadStreamToS3Output {
  etag: string;
  size: number;
}

function normalizeEtag(etag: PutObjectCommandOutput['ETag']): string {
  return (etag ?? '').replace(/^"|"$/g, '');
}

/**
 * AWS S3 rejects plain HTTP/1.1 chunked PutObject requests with:
 * `NotImplemented: Header Transfer-Encoding`.
 *
 * Busboy exposes each multipart part as a stream without a per-file content
 * length, so spool once to a temp file, count bytes, then send a normal
 * PutObject request with Content-Length set.
 */
export async function uploadStreamToS3({
  client,
  bucket,
  key,
  body,
  contentType,
}: UploadStreamToS3Input): Promise<UploadStreamToS3Output> {
  const tempDir = await mkdtemp(join(tmpdir(), 'garage-s3-upload-'));
  const tempPath = join(tempDir, 'body');
  let size = 0;

  try {
    const counter = new Transform({
      transform(chunk: Buffer | string, _enc, cb) {
        size += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        cb(null, chunk);
      },
    });

    await pipeline(body, counter, createWriteStream(tempPath));

    const out = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(tempPath),
        ContentLength: size,
        ContentType: contentType,
      }),
    );

    return {
      etag: normalizeEtag(out.ETag),
      size,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
