import { Readable } from 'node:stream';
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { uploadStreamToS3 } from '../upload-stream.js';

async function readBody(body: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of body as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

describe('uploadStreamToS3', () => {
  it('sets ContentLength when uploading a stream body', async () => {
    const send = vi.fn(async (command: PutObjectCommand) => {
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input.Bucket).toBe('bucket-a');
      expect(command.input.Key).toBe('folder/hello.txt');
      expect(command.input.ContentLength).toBe(11);
      expect(command.input.ContentType).toBe('text/plain');
      await expect(readBody(command.input.Body)).resolves.toEqual(Buffer.from('hello world'));
      return { ETag: '"etag-1"' };
    });

    const result = await uploadStreamToS3({
      client: { send } as unknown as S3Client,
      bucket: 'bucket-a',
      key: 'folder/hello.txt',
      body: Readable.from(['hello ', 'world']),
      contentType: 'text/plain',
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ etag: 'etag-1', size: 11 });
  });

  it('keeps ContentLength at 0 for empty object uploads', async () => {
    const send = vi.fn(async (command: PutObjectCommand) => {
      expect(command.input.ContentLength).toBe(0);
      await expect(readBody(command.input.Body)).resolves.toEqual(Buffer.alloc(0));
      return { ETag: '"empty-etag"' };
    });

    const result = await uploadStreamToS3({
      client: { send } as unknown as S3Client,
      bucket: 'bucket-a',
      key: 'folder/.keep',
      body: Readable.from([]),
      contentType: 'application/octet-stream',
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ etag: 'empty-etag', size: 0 });
  });
});
