import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import Busboy from 'busboy';
import { z } from 'zod';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  ListObjectsV2Command,
  PutObjectCommand,
  UploadPartCommand,
  UploadPartCopyCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ResolveContextFn, BucketContext, Logger } from './types.js';
import { BucketAccessError } from './types.js';
import { uploadStreamToS3 } from './upload-stream.js';
import {
  COPY_SINGLE_MAX_BYTES,
  LARGE_FILE_THRESHOLD_BYTES,
  MULTIPART_COPY_PART_SIZE_BYTES,
  MULTIPART_DEFAULT_MAX_PART_SIZE_BYTES,
  MULTIPART_MAX_PARTS,
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_TARGET_PARTS,
} from './constants.js';
import { computeMultipartPartSize } from './multipart-policy.js';
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

/**
 * True when a streaming pipeline rejected because the CLIENT went away mid-
 * download (the response closed before it finished). That's a normal disconnect,
 * not a server error — don't log it or try to write to the dead socket.
 */
function isClientDisconnect(err: unknown): boolean {
  return (err as { code?: string })?.code === 'ERR_STREAM_PREMATURE_CLOSE';
}

/**
 * Copy an object larger than S3's 5 GiB single-CopyObject limit using a server-
 * side multipart copy: CreateMultipartUpload + ranged UploadPartCopy per part +
 * CompleteMultipartUpload. The source object's content metadata is carried over
 * (single CopyObject would copy it automatically). On any failure the partial
 * upload is aborted so S3 doesn't keep the orphaned parts. Returns the final
 * (unquoted) ETag.
 *
 * CopySourceRange is INCLUSIVE on both ends (unlike a JS slice) — the last part
 * is clamped to `size - 1`, so an off-by-one here would silently corrupt the copy.
 */
async function copyObjectViaMultipart(
  client: BucketContext['client'],
  bucket: string,
  src: string,
  dst: string,
  head: HeadObjectCommandOutput,
): Promise<string> {
  const size = head.ContentLength ?? 0;
  // Bump the part size up if 1 GiB parts would blow past the 10k-part cap.
  const partSize = Math.max(MULTIPART_COPY_PART_SIZE_BYTES, Math.ceil(size / MULTIPART_MAX_PARTS));
  const copySource = encodeURIComponent(`${bucket}/${src}`);

  const created = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: dst,
      ContentType: head.ContentType,
      ContentEncoding: head.ContentEncoding,
      ContentDisposition: head.ContentDisposition,
      ContentLanguage: head.ContentLanguage,
      CacheControl: head.CacheControl,
      Metadata: head.Metadata,
    }),
  );
  const uploadId = created.UploadId;
  if (!uploadId) throw new Error('S3 did not return an upload id for the copy');

  try {
    const numParts = Math.max(1, Math.ceil(size / partSize));
    const parts: { PartNumber: number; ETag: string | undefined }[] = [];
    for (let i = 0; i < numParts; i++) {
      const start = i * partSize;
      const end = Math.min(start + partSize, size) - 1; // inclusive; last clamps to size-1
      const out = await client.send(
        new UploadPartCopyCommand({
          Bucket: bucket,
          Key: dst,
          UploadId: uploadId,
          PartNumber: i + 1,
          CopySource: copySource,
          CopySourceRange: `bytes=${start}-${end}`,
        }),
      );
      parts.push({ PartNumber: i + 1, ETag: out.CopyPartResult?.ETag });
    }
    const completed = await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: dst,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
    return (completed.ETag ?? '').replace(/^"|"$/g, '');
  } catch (err) {
    await client
      .send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: dst, UploadId: uploadId }))
      .catch(() => undefined);
    throw err;
  }
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

/**
 * Origins to allow for browser-direct upload/download CORS. Operator config wins;
 * otherwise default to the requesting app's Origin; fall back to `*` only when no
 * Origin is present (e.g. a non-browser caller) and nothing is configured.
 */
function corsOriginsFor(req: Request, configured?: string[]): string[] {
  if (configured && configured.length > 0) return configured;
  const origin = req.headers.origin;
  return typeof origin === 'string' && origin ? [origin] : ['*'];
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
   * Ladder floor for POST /multipart/create — also the exact part size returned
   * when the caller passes no `fileSize`. Default MULTIPART_PART_SIZE_BYTES
   * (8 MiB). Must be >= 5 MiB per S3 rules.
   */
  multipartPartSize?: number;
  /**
   * Soft target part count the adaptive ladder climbs toward when a `fileSize`
   * is supplied. Default MULTIPART_TARGET_PARTS (2000).
   */
  multipartTargetParts?: number;
  /**
   * Ladder top for the adaptive part size. Default
   * MULTIPART_DEFAULT_MAX_PART_SIZE_BYTES (1 GiB).
   */
  multipartMaxPartSize?: number;
  /**
   * Auto-manage the bucket's CORS rules for browser-direct transfers. Default
   * true; set false to leave bucket CORS entirely to the operator.
   */
  manageCors?: boolean;
  /**
   * Explicit allowed origins for the auto-managed CORS rule. When unset, the
   * requesting app's Origin header is used (falling back to `*` if absent).
   */
  corsAllowedOrigins?: string[];
}

export function createBucketRouter({
  resolveContext,
  logger = defaultLogger,
  proxyUploadMaxBytes = LARGE_FILE_THRESHOLD_BYTES,
  multipartPartSize = MULTIPART_PART_SIZE_BYTES,
  multipartTargetParts = MULTIPART_TARGET_PARTS,
  multipartMaxPartSize = MULTIPART_DEFAULT_MAX_PART_SIZE_BYTES,
  manageCors = true,
  corsAllowedOrigins,
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

    // Phase A — fetch the object. Failures here (404, auth, network) happen before
    // any bytes or headers are sent, so we can still return a clean JSON error.
    let out: GetObjectCommandOutput;
    try {
      const range = req.header('range') ?? undefined;
      out = await ctx.client.send(
        new GetObjectCommand({ Bucket: ctx.bucketName, Key: key, Range: range }),
      );
    } catch (err) {
      if (httpStatusOf(err) === 404) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      logger.error({ err, bucket: ctx.bucketName, key }, 'download failed');
      sendError(res, err);
      return;
    }

    const body = out.Body;
    if (!body || typeof (body as { pipe?: unknown }).pipe !== 'function') {
      res.status(502).json({ error: 'No body returned from S3' });
      return;
    }

    const filename = key.includes('/') ? key.split('/').pop()! : key;
    if (out.ContentRange) {
      res.status(206);
      res.setHeader('Content-Range', out.ContentRange);
      res.setHeader('Accept-Ranges', 'bytes');
    }
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    if (out.ContentType) res.setHeader('Content-Type', out.ContentType);
    if (out.ContentLength) res.setHeader('Content-Length', String(out.ContentLength));

    // Phase B — stream. `pipeline` (not a bare `.pipe`) tears BOTH streams down on
    // a mid-stream upstream error or a client disconnect, so we never leak the S3
    // socket or leave a half-written response. If the client goes away, stop
    // pulling from upstream right away.
    const source = body as Readable;
    const onClose = () => {
      if (!res.writableFinished) source.destroy();
    };
    res.on('close', onClose);
    try {
      await pipeline(source, res);
    } catch (err) {
      if (!isClientDisconnect(err)) {
        logger.error({ err, bucket: ctx.bucketName, key }, 'download stream failed');
        // Content-Length and headers are already committed, so we can't switch to
        // a JSON error; destroy the socket so the client sees a truncated transfer
        // instead of reading a short body as a complete file.
        if (!res.destroyed) res.destroy(err instanceof Error ? err : new Error('download failed'));
      }
    } finally {
      res.removeListener('close', onClose);
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
      if (body.operation === 'getObject' && manageCors) {
        await ensureBucketCors({
          client: ctx.client,
          bucket: ctx.bucketName,
          cacheKey: cacheKeyFor(ctx),
          allowedOrigins: corsOriginsFor(req, corsAllowedOrigins),
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
    // Optional hint: when present, the returned partSize scales with it so the
    // part count stays bounded. Omitted → the static multipartPartSize default
    // (backward compatible for an un-rebuilt Admin host).
    fileSize: z.number().int().nonnegative().optional(),
  });

  router.post('/multipart/create', async (req, res) => {
    const body = parseBody(MultipartCreateSchema, req, res);
    if (!body) return;
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      if (manageCors) {
        await ensureBucketCors({
          client: ctx.client,
          bucket: ctx.bucketName,
          cacheKey: cacheKeyFor(ctx),
          allowedOrigins: corsOriginsFor(req, corsAllowedOrigins),
          logger,
        });
      }

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
      const partSize =
        body.fileSize !== undefined
          ? computeMultipartPartSize(body.fileSize, {
              basePartSize: multipartPartSize,
              targetParts: multipartTargetParts,
              maxPartSize: multipartMaxPartSize,
            })
          : multipartPartSize;
      res.json({
        uploadId: out.UploadId,
        key: body.key,
        partSize,
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
      // HeadObject first: a single CopyObject caps at 5 GiB, so we need the source
      // size to decide between it and the multipart-copy fallback. It also gives a
      // clean 404 when the source is missing.
      const head = await ctx.client.send(
        new HeadObjectCommand({ Bucket: ctx.bucketName, Key: body.src }),
      );
      const size = head.ContentLength ?? 0;

      if (size <= COPY_SINGLE_MAX_BYTES) {
        const out = await ctx.client.send(
          new CopyObjectCommand({
            Bucket: ctx.bucketName,
            // CopySource MUST be URL-encoded for keys containing reserved chars.
            CopySource: encodeURIComponent(`${ctx.bucketName}/${body.src}`),
            Key: body.dst,
          }),
        );
        res.json({ etag: (out.CopyObjectResult?.ETag ?? '').replace(/^"|"$/g, '') });
        return;
      }

      const etag = await copyObjectViaMultipart(
        ctx.client,
        ctx.bucketName,
        body.src,
        body.dst,
        head,
      );
      res.json({ etag });
    } catch (err) {
      if (httpStatusOf(err) === 404) {
        res.status(404).json({ error: 'Source object not found' });
        return;
      }
      logger.error({ err, bucket: ctx.bucketName, src: body.src, dst: body.dst }, 'copy failed');
      sendError(res, err);
    }
  });

  return router;
}
