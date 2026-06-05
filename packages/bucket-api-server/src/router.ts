import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import Busboy from 'busboy';
import { z } from 'zod';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ResolveContextFn, BucketContext, Logger } from './types.js';
import { BucketAccessError } from './types.js';
import { uploadStreamToS3 } from './upload-stream.js';
import {
  LARGE_FILE_THRESHOLD_BYTES,
  MULTIPART_MAX_PARTS,
  MULTIPART_PART_SIZE_BYTES,
} from './constants.js';
import { ensureBucketCors } from './cors.js';

interface ShapeInput {
  Key?: string | undefined;
  Size?: number | undefined;
  ETag?: string | undefined;
  LastModified?: Date | undefined;
  StorageClass?: string | undefined;
  ContentType?: string | undefined;
}

function shapeObject(o: ShapeInput) {
  return {
    key: o.Key ?? '',
    size: o.Size ?? 0,
    etag: (o.ETag ?? '').replace(/^"|"$/g, ''),
    lastModified: o.LastModified ? o.LastModified.toISOString() : null,
    storageClass: o.StorageClass ?? null,
    contentType: o.ContentType ?? null,
  };
}

/** Extract the upstream S3/HTTP status code from an AWS SDK error, if present. */
function httpStatusOf(err: unknown): number | undefined {
  return (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
}

function sendError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  // Forward the upstream S3 status when it's a meaningful HTTP error (403, 404,
  // 400, …) so callers can react to it; fall back to 502 for network failures
  // and anything without a usable status code.
  const upstream = httpStatusOf(err);
  const status =
    typeof upstream === 'number' && upstream >= 400 && upstream <= 599 ? upstream : 502;
  res.status(status).json({ error: message });
}

/**
 * Parse a request body against a Zod schema. On a validation failure, sends the
 * uniform 400 `{ error: issues }` response and returns null so the caller can
 * early-return with `if (!body) return;`. Non-Zod errors propagate — they signal
 * a bug, not bad input.
 */
function parseBody<S extends z.ZodTypeAny>(
  schema: S,
  req: Request,
  res: Response,
): z.infer<S> | null {
  try {
    return schema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues });
      return null;
    }
    throw err;
  }
}

interface UploadOutcome {
  key: string;
  etag: string;
  size: number;
}

/**
 * Decide the POST /upload response once every file has settled. Extracted as a
 * pure function so the precedence rules are unit-testable without a multipart
 * harness: a genuine upload failure (or client abort) outranks an oversize; an
 * oversize still reports the files that DID fit (so a sibling tripping the size
 * limit never drops an already-stored object); otherwise 200 with the uploads.
 */
export function decideUploadResponse(
  results: PromiseSettledResult<void>[],
  state: { aborted: boolean; oversized: boolean; uploaded: UploadOutcome[]; limit: number },
): { status: number; body: Record<string, unknown> } {
  const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failure || state.aborted) {
    return { status: 502, body: { error: failure ? String(failure.reason) : 'upload aborted' } };
  }
  if (state.oversized) {
    return {
      status: 413,
      body: {
        error: `One or more files exceed the proxy upload limit (${state.limit} bytes). Use the multipart upload flow.`,
        limit: state.limit,
        uploaded: state.uploaded,
      },
    };
  }
  return { status: 200, body: { uploaded: state.uploaded } };
}

const defaultLogger: Logger = {
  error: (bindings, msg) => console.error(msg, bindings),
};

function cacheKeyFor(ctx: BucketContext): string {
  return ctx.cacheKey ?? ctx.bucketName;
}

async function withContext(
  req: Request,
  res: Response,
  resolveContext: ResolveContextFn,
  logger: Logger,
): Promise<BucketContext | null> {
  try {
    return await resolveContext(req);
  } catch (err) {
    if (err instanceof BucketAccessError) {
      res.status(err.status).json({ error: err.message });
      return null;
    }
    logger.error({ err }, 'unexpected error in bucket context resolver');
    res.status(502).json({ error: 'Failed to resolve bucket context' });
    return null;
  }
}

export interface CreateBucketRouterOptions {
  resolveContext: ResolveContextFn;
  logger?: Logger;
  /**
   * Maximum per-file size accepted by POST /upload. Anything larger is
   * rejected so callers fall back to the multipart upload flow. Default
   * matches LARGE_FILE_THRESHOLD_BYTES (10 MiB).
   */
  proxyUploadMaxBytes?: number;
  /**
   * Recommended part size returned by POST /multipart/create. Default
   * MULTIPART_PART_SIZE_BYTES (8 MiB). Must be >= 5 MiB per S3 rules.
   */
  multipartPartSize?: number;
}

export function createBucketRouter({
  resolveContext,
  logger = defaultLogger,
  proxyUploadMaxBytes = LARGE_FILE_THRESHOLD_BYTES,
  multipartPartSize = MULTIPART_PART_SIZE_BYTES,
}: CreateBucketRouterOptions): ExpressRouter {
  const router = Router({ mergeParams: true });

  // ---------------------------------------------------------------------------
  // GET /list
  // ---------------------------------------------------------------------------

  router.get('/list', async (req, res) => {
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      const prefixRaw = typeof req.query.prefix === 'string' ? req.query.prefix : '';
      const delimiter = typeof req.query.delimiter === 'string' ? req.query.delimiter : '/';
      const continuationToken =
        typeof req.query.continuationToken === 'string' ? req.query.continuationToken : undefined;
      const maxKeysRaw = req.query.maxKeys;
      const maxKeys =
        typeof maxKeysRaw === 'string' && /^\d+$/.test(maxKeysRaw)
          ? Math.min(parseInt(maxKeysRaw, 10), 1000)
          : 100;

      const out = await ctx.client.send(
        new ListObjectsV2Command({
          Bucket: ctx.bucketName,
          Prefix: prefixRaw || undefined,
          Delimiter: delimiter || undefined,
          ContinuationToken: continuationToken,
          MaxKeys: maxKeys,
        }),
      );

      const objects = (out.Contents ?? []).map(shapeObject);
      const prefixes = (out.CommonPrefixes ?? []).map((p) => p.Prefix ?? '').filter(Boolean);

      res.json({
        objects,
        prefixes,
        nextContinuationToken: out.NextContinuationToken ?? undefined,
      });
    } catch (err) {
      logger.error({ err, bucket: ctx.bucketName }, 'list failed');
      sendError(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /object  (HEAD-equivalent metadata)
  // ---------------------------------------------------------------------------

  router.get('/object', async (req, res) => {
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!key) {
      res.status(400).json({ error: 'Missing key' });
      return;
    }
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      const head = await ctx.client.send(
        new HeadObjectCommand({ Bucket: ctx.bucketName, Key: key }),
      );
      res.json(
        shapeObject({
          Key: key,
          Size: head.ContentLength,
          ETag: head.ETag,
          LastModified: head.LastModified,
          StorageClass: head.StorageClass,
          ContentType: head.ContentType,
        }),
      );
    } catch (err) {
      if (httpStatusOf(err) === 404) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      logger.error({ err, bucket: ctx.bucketName, key }, 'head failed');
      sendError(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /download  (streams the object through the BFF — no credentials exposed)
  // ---------------------------------------------------------------------------

  router.get('/download', async (req, res) => {
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!key) {
      res.status(400).json({ error: 'Missing key' });
      return;
    }
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      const range = req.header('range') ?? undefined;
      const out = await ctx.client.send(
        new GetObjectCommand({ Bucket: ctx.bucketName, Key: key, Range: range }),
      );
      const filename = key.includes('/') ? key.split('/').pop()! : key;
      if (out.ContentRange) {
        res.status(206);
        res.setHeader('Content-Range', out.ContentRange);
        res.setHeader('Accept-Ranges', 'bytes');
      }
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`,
      );
      if (out.ContentType) res.setHeader('Content-Type', out.ContentType);
      if (out.ContentLength) res.setHeader('Content-Length', String(out.ContentLength));
      const body = out.Body;
      if (!body || typeof (body as { pipe?: unknown }).pipe !== 'function') {
        res.status(502).json({ error: 'No body returned from S3' });
        return;
      }
      (body as NodeJS.ReadableStream).pipe(res);
    } catch (err) {
      if (httpStatusOf(err) === 404) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      logger.error({ err, bucket: ctx.bucketName, key }, 'download failed');
      if (!res.headersSent) sendError(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /presign
  //
  // getObject and putObject sign single-shot S3 operations. Callers can pass
  // responseContentDisposition to force the browser into a download flow even
  // when the object would normally render inline.
  // ---------------------------------------------------------------------------

  const PresignSchema = z.object({
    key: z.string().min(1),
    operation: z.enum(['getObject', 'putObject']),
    expiresIn: z.number().int().positive().max(86400).default(900),
    responseContentDisposition: z.string().optional(),
  });

  router.post('/presign', async (req, res) => {
    const body = parseBody(PresignSchema, req, res);
    if (!body) return;
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      // Browser direct GET also needs CORS — ensure once per (endpoint, bucket).
      if (body.operation === 'getObject') {
        await ensureBucketCors({
          client: ctx.client,
          bucket: ctx.bucketName,
          cacheKey: cacheKeyFor(ctx),
          logger,
        });
      }

      const cmd =
        body.operation === 'getObject'
          ? new GetObjectCommand({
              Bucket: ctx.bucketName,
              Key: body.key,
              ResponseContentDisposition: body.responseContentDisposition,
            })
          : new PutObjectCommand({ Bucket: ctx.bucketName, Key: body.key });
      const url = await getSignedUrl(ctx.client, cmd, { expiresIn: body.expiresIn });
      const expiresAt = new Date(Date.now() + body.expiresIn * 1000).toISOString();
      res.json({ url, expiresAt });
    } catch (err) {
      logger.error({ err, bucket: ctx.bucketName, key: body.key }, 'presign failed');
      sendError(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /upload  (multipart/form-data; spooled, then sent to S3 PutObject)
  //
  // Capped at proxyUploadMaxBytes per file. Larger files must use the
  // multipart upload flow below — that path never touches the BFF stream.
  // ---------------------------------------------------------------------------

  router.post('/upload', (req, res) => {
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      res.status(400).json({ error: 'Expected multipart/form-data' });
      return;
    }

    withContext(req, res, resolveContext, logger)
      .then((ctx) => {
        if (!ctx) return;

        const bb = Busboy({ headers: req.headers, limits: { fileSize: proxyUploadMaxBytes } });
        const uploaded: UploadOutcome[] = [];
        const pending: Promise<void>[] = [];
        let prefix = '';
        let finished = false;
        let aborted = false;
        let oversized = false;

        bb.on('field', (name, value) => {
          if (name === 'prefix') prefix = value;
        });

        bb.on('file', (_fieldName, fileStream, info) => {
          // Normalize prefix: collapse repeated slashes, drop leading slash.
          const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
          const key = cleanPrefix ? `${cleanPrefix}/${info.filename}` : info.filename;

          // Oversize is tracked PER FILE: a file that blows past the limit is
          // aborted (its truncated bytes are never PutObject'd) without affecting
          // the files that fit. The status code is decided in 'finish' once every
          // upload has settled, so a sibling's oversize can't drop an
          // already-stored file from the response.
          const fileAbort = new AbortController();
          let fileOversized = false;

          fileStream.on('limit', () => {
            fileOversized = true;
            oversized = true;
            fileAbort.abort();
            fileStream.resume();
          });

          const p = uploadStreamToS3({
            client: ctx.client,
            bucket: ctx.bucketName,
            key,
            body: fileStream,
            contentType: info.mimeType,
            signal: fileAbort.signal,
          })
            .then(({ etag, size }) => {
              if (fileOversized) return; // truncated — never recorded
              uploaded.push({ key, etag, size });
            })
            .catch((err) => {
              if (fileOversized) return; // expected abort, not a real failure
              aborted = true;
              logger.error({ err, key }, 'upload failed');
              throw err;
            });

          pending.push(p);
        });

        bb.on('error', (err) => {
          aborted = true;
          logger.error({ err }, 'busboy error');
          if (!res.headersSent) sendError(res, err);
        });

        bb.on('finish', () => {
          finished = true;
          Promise.allSettled(pending).then((results) => {
            const { status, body } = decideUploadResponse(results, {
              aborted,
              oversized,
              uploaded,
              limit: proxyUploadMaxBytes,
            });
            if (!res.headersSent) res.status(status).json(body);
          });
        });

        req.on('aborted', () => {
          aborted = true;
          if (!finished) bb.destroy();
        });

        req.pipe(bb);
      })
      .catch((err) => {
        logger.error({ err }, 'upload setup failed');
        if (!res.headersSent) sendError(res, err);
      });
  });

  // ---------------------------------------------------------------------------
  // POST /multipart/create
  //
  // Initiates a multipart upload and returns the uploadId + the part size the
  // client should use. The bucket also has CORS ensured on the way out so the
  // upcoming browser PUTs aren't blocked by the preflight.
  // ---------------------------------------------------------------------------

  const MultipartCreateSchema = z.object({
    key: z.string().min(1),
    contentType: z.string().optional(),
  });

  router.post('/multipart/create', async (req, res) => {
    const body = parseBody(MultipartCreateSchema, req, res);
    if (!body) return;
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      await ensureBucketCors({
        client: ctx.client,
        bucket: ctx.bucketName,
        cacheKey: cacheKeyFor(ctx),
        logger,
      });

      const out = await ctx.client.send(
        new CreateMultipartUploadCommand({
          Bucket: ctx.bucketName,
          Key: body.key,
          ContentType: body.contentType,
        }),
      );
      if (!out.UploadId) {
        res.status(502).json({ error: 'S3 did not return an upload id' });
        return;
      }
      res.json({
        uploadId: out.UploadId,
        key: body.key,
        partSize: multipartPartSize,
        maxParts: MULTIPART_MAX_PARTS,
      });
    } catch (err) {
      logger.error({ err, bucket: ctx.bucketName, key: body.key }, 'multipart create failed');
      sendError(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /multipart/sign
  //
  // Batch-presigns UploadPart URLs so a client uploading N parts only needs
  // one round-trip to the BFF.
  // ---------------------------------------------------------------------------

  const MultipartSignSchema = z.object({
    key: z.string().min(1),
    uploadId: z.string().min(1),
    partNumbers: z.array(z.number().int().min(1).max(MULTIPART_MAX_PARTS)).min(1).max(1000),
    expiresIn: z.number().int().positive().max(86400).default(3600),
  });

  router.post('/multipart/sign', async (req, res) => {
    const body = parseBody(MultipartSignSchema, req, res);
    if (!body) return;
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      const urls = await Promise.all(
        body.partNumbers.map(async (partNumber) => {
          const cmd = new UploadPartCommand({
            Bucket: ctx.bucketName,
            Key: body.key,
            UploadId: body.uploadId,
            PartNumber: partNumber,
          });
          const url = await getSignedUrl(ctx.client, cmd, { expiresIn: body.expiresIn });
          return { partNumber, url };
        }),
      );
      const expiresAt = new Date(Date.now() + body.expiresIn * 1000).toISOString();
      res.json({ urls, expiresAt });
    } catch (err) {
      logger.error(
        { err, bucket: ctx.bucketName, key: body.key, uploadId: body.uploadId },
        'multipart sign failed',
      );
      sendError(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /multipart/complete
  //
  // Finalizes the multipart upload using the etag the client collected from
  // each PUT response. S3 stitches the parts into the final object atomically.
  // ---------------------------------------------------------------------------

  const MultipartCompleteSchema = z.object({
    key: z.string().min(1),
    uploadId: z.string().min(1),
    parts: z
      .array(
        z.object({
          partNumber: z.number().int().min(1).max(MULTIPART_MAX_PARTS),
          etag: z.string().min(1),
        }),
      )
      .min(1),
  });

  router.post('/multipart/complete', async (req, res) => {
    const body = parseBody(MultipartCompleteSchema, req, res);
    if (!body) return;
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      const sortedParts = [...body.parts].sort((a, b) => a.partNumber - b.partNumber);
      const out = await ctx.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: ctx.bucketName,
          Key: body.key,
          UploadId: body.uploadId,
          MultipartUpload: {
            Parts: sortedParts.map((p) => ({
              PartNumber: p.partNumber,
              // S3 expects the etag wrapped in double quotes, but accepts
              // either form for tolerance. We send the canonical quoted form.
              ETag: /^".*"$/.test(p.etag) ? p.etag : `"${p.etag.replace(/^"|"$/g, '')}"`,
            })),
          },
        }),
      );
      res.json({
        key: body.key,
        etag: (out.ETag ?? '').replace(/^"|"$/g, ''),
        location: out.Location ?? null,
      });
    } catch (err) {
      logger.error(
        { err, bucket: ctx.bucketName, key: body.key, uploadId: body.uploadId },
        'multipart complete failed',
      );
      sendError(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /multipart/abort
  //
  // Best-effort cleanup when the client cancels or fails mid-stream. Garage
  // and S3 both charge for in-progress multipart data until aborted.
  // ---------------------------------------------------------------------------

  const MultipartAbortSchema = z.object({
    key: z.string().min(1),
    uploadId: z.string().min(1),
  });

  router.post('/multipart/abort', async (req, res) => {
    const body = parseBody(MultipartAbortSchema, req, res);
    if (!body) return;
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      await ctx.client.send(
        new AbortMultipartUploadCommand({
          Bucket: ctx.bucketName,
          Key: body.key,
          UploadId: body.uploadId,
        }),
      );
      res.json({ ok: true });
    } catch (err) {
      logger.error(
        { err, bucket: ctx.bucketName, key: body.key, uploadId: body.uploadId },
        'multipart abort failed',
      );
      sendError(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /objects
  // ---------------------------------------------------------------------------

  const DeleteSchema = z.object({
    keys: z.array(z.string().min(1)).min(1).max(1000),
  });

  router.delete('/objects', async (req, res) => {
    const body = parseBody(DeleteSchema, req, res);
    if (!body) return;
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      if (body.keys.length === 1) {
        // Garage's DeleteObjects (S3 batch) is sometimes flaky on
        // single-key payloads; use plain DeleteObject for the common case.
        await ctx.client.send(
          new DeleteObjectCommand({ Bucket: ctx.bucketName, Key: body.keys[0]! }),
        );
        res.json({ deleted: [body.keys[0]!], errors: [] });
        return;
      }

      const out = await ctx.client.send(
        new DeleteObjectsCommand({
          Bucket: ctx.bucketName,
          Delete: {
            Objects: body.keys.map((k) => ({ Key: k })),
            Quiet: false,
          },
        }),
      );

      res.json({
        deleted: (out.Deleted ?? []).map((d) => d.Key ?? '').filter(Boolean),
        errors: (out.Errors ?? []).map((e) => ({
          key: e.Key ?? '',
          message: e.Message ?? e.Code ?? 'unknown error',
        })),
      });
    } catch (err) {
      logger.error({ err, bucket: ctx.bucketName, count: body.keys.length }, 'delete failed');
      sendError(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /copy
  // ---------------------------------------------------------------------------

  const CopySchema = z.object({
    src: z.string().min(1),
    dst: z.string().min(1),
  });

  router.post('/copy', async (req, res) => {
    const body = parseBody(CopySchema, req, res);
    if (!body) return;
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      const out = await ctx.client.send(
        new CopyObjectCommand({
          Bucket: ctx.bucketName,
          // CopySource MUST be URL-encoded for keys containing reserved chars.
          CopySource: encodeURIComponent(`${ctx.bucketName}/${body.src}`),
          Key: body.dst,
        }),
      );
      res.json({
        etag: (out.CopyObjectResult?.ETag ?? '').replace(/^"|"$/g, ''),
      });
    } catch (err) {
      logger.error({ err, bucket: ctx.bucketName, src: body.src, dst: body.dst }, 'copy failed');
      sendError(res, err);
    }
  });

  return router;
}
