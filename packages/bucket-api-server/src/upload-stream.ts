import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PutObjectCommand, type PutObjectCommandOutput, type S3Client } from '@aws-sdk/client-s3';

import { UPLOAD_MEMORY_SPOOL_MAX_BYTES } from './constants.js';

interface UploadStreamToS3Input {
  client: S3Client;
  bucket: string;
  key: string;
  body: NodeJS.ReadableStream;
  contentType?: string | undefined;
  /**
   * Aborts the upload before the object is sent to S3. Used by the proxy
   * upload route to discard files that blow past the size limit — without
   * this, the truncated bytes spooled so far would still be PutObject'd.
   */
  signal?: AbortSignal | undefined;
  /**
   * Spool the body in memory up to this many bytes before falling back to a
   * temp file. Defaults to {@link UPLOAD_MEMORY_SPOOL_MAX_BYTES}. The common
   * small-file proxy upload stays entirely in memory (no disk round-trip).
   */
  memorySpoolMaxBytes?: number | undefined;
}

interface UploadStreamToS3Output {
  etag: string;
  size: number;
}

function normalizeEtag(etag: PutObjectCommandOutput['ETag']): string {
  return (etag ?? '').replace(/^"|"$/g, '');
}

/**
 * Writable sink that counts bytes and keeps the body in memory, spilling to a
 * temp file only once it exceeds `cap`. This avoids the 2× disk I/O of always
 * spooling to disk for the common small-file case while still bounding memory
 * for unusually large proxy uploads.
 */
class SpoolSink extends Writable {
  size = 0;
  /** Set once the body has spilled to disk; used by the caller to clean up. */
  tempDir: string | undefined;

  private readonly cap: number;
  private chunks: Buffer[] = [];
  private buffered = 0;
  private file: WriteStream | undefined;
  private tempPath: string | undefined;

  constructor(cap: number) {
    super();
    this.cap = cap;
  }

  /** Where the body ended up — an in-memory buffer, or a temp file path. */
  result(): { buffer: Buffer } | { path: string } {
    return this.tempPath !== undefined
      ? { path: this.tempPath }
      : { buffer: Buffer.concat(this.chunks) };
  }

  private async spillToDisk(): Promise<void> {
    this.tempDir = await mkdtemp(join(tmpdir(), 'garage-s3-upload-'));
    this.tempPath = join(this.tempDir, 'body');
    this.file = createWriteStream(this.tempPath);
    for (const chunk of this.chunks) await this.writeToFile(chunk);
    // Drop the in-memory copy now that it lives on disk.
    this.chunks = [];
    this.buffered = 0;
  }

  private async writeToFile(buf: Buffer): Promise<void> {
    if (!this.file!.write(buf)) await once(this.file!, 'drain');
  }

  override _write(
    chunk: Buffer | string,
    enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc);
    this.size += buf.length;
    const handle = async (): Promise<void> => {
      if (this.file) {
        await this.writeToFile(buf);
        return;
      }
      if (this.buffered + buf.length <= this.cap) {
        this.chunks.push(buf);
        this.buffered += buf.length;
        return;
      }
      await this.spillToDisk();
      await this.writeToFile(buf);
    };
    handle().then(() => cb(), cb);
  }

  override _final(cb: (err?: Error | null) => void): void {
    if (!this.file) {
      cb();
      return;
    }
    this.file.end();
    this.file.once('finish', () => cb());
    this.file.once('error', cb);
  }
}

/**
 * AWS S3 rejects plain HTTP/1.1 chunked PutObject requests with:
 * `NotImplemented: Header Transfer-Encoding`.
 *
 * Busboy exposes each multipart part as a stream without a per-file content
 * length, so spool the body to learn its size, then send a normal PutObject
 * with Content-Length set. Small bodies (the common case) are spooled in memory;
 * only bodies larger than `memorySpoolMaxBytes` fall back to a temp file.
 */
export async function uploadStreamToS3({
  client,
  bucket,
  key,
  body,
  contentType,
  signal,
  memorySpoolMaxBytes = UPLOAD_MEMORY_SPOOL_MAX_BYTES,
}: UploadStreamToS3Input): Promise<UploadStreamToS3Output> {
  const sink = new SpoolSink(memorySpoolMaxBytes);

  try {
    await pipeline(body, sink);

    // The stream is fully spooled by now. If it was aborted mid-flight (e.g.
    // the file exceeded the proxy limit and got truncated), bail before
    // persisting a partial object to the bucket.
    if (signal?.aborted) {
      throw new Error('Upload aborted before send');
    }

    const spooled = sink.result();
    const out = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: 'buffer' in spooled ? spooled.buffer : createReadStream(spooled.path),
        ContentLength: sink.size,
        ContentType: contentType,
      }),
    );

    return {
      etag: normalizeEtag(out.ETag),
      size: sink.size,
    };
  } finally {
    if (sink.tempDir !== undefined) {
      await rm(sink.tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
