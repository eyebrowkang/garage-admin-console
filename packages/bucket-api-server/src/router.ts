import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import Busboy from 'busboy';
import { z } from 'zod';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ResolveContextFn, BucketContext, Logger } from './types.js';
import { BucketAccessError } from './types.js';
import { uploadStreamToS3 } from './upload-stream.js';

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

function sendError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  res.status(502).json({ error: message });
}

const defaultLogger: Logger = {
  error: (bindings, msg) => console.error(msg, bindings),
};

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
}

export function createBucketRouter({
  resolveContext,
  logger = defaultLogger,
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
      if ((err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) {
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
      if ((err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      logger.error({ err, bucket: ctx.bucketName, key }, 'download failed');
      if (!res.headersSent) sendError(res, err);
    }
  });

  // ---------------------------------------------------------------------------
  // POST /presign
  // ---------------------------------------------------------------------------

  const PresignSchema = z.object({
    key: z.string().min(1),
    operation: z.enum(['getObject', 'putObject']),
    expiresIn: z.number().int().positive().max(86400).default(900),
  });

  router.post('/presign', async (req, res) => {
    let body: z.infer<typeof PresignSchema>;
    try {
      body = PresignSchema.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.issues });
        return;
      }
      throw err;
    }
    const ctx = await withContext(req, res, resolveContext, logger);
    if (!ctx) return;
    try {
      const cmd =
        body.operation === 'getObject'
          ? new GetObjectCommand({ Bucket: ctx.bucketName, Key: body.key })
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
  // ---------------------------------------------------------------------------

  interface UploadResult {
    key: string;
    etag: string;
    size: number;
  }

  router.post('/upload', (req, res) => {
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      res.status(400).json({ error: 'Expected multipart/form-data' });
      return;
    }

    withContext(req, res, resolveContext, logger)
      .then((ctx) => {
        if (!ctx) return;

        const bb = Busboy({ headers: req.headers });
        const uploaded: UploadResult[] = [];
        const pending: Promise<void>[] = [];
        let prefix = '';
        let finished = false;
        let aborted = false;

        bb.on('field', (name, value) => {
          if (name === 'prefix') prefix = value;
        });

        bb.on('file', (_fieldName, fileStream, info) => {
          // Normalize prefix: collapse repeated slashes, drop leading slash.
          const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
          const key = cleanPrefix ? `${cleanPrefix}/${info.filename}` : info.filename;

          const p = uploadStreamToS3({
            client: ctx.client,
            bucket: ctx.bucketName,
            key,
            body: fileStream,
            contentType: info.mimeType,
          })
            .then(({ etag, size }) => {
              uploaded.push({ key, etag, size });
            })
            .catch((err) => {
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
            const failures = results.filter((r) => r.status === 'rejected');
            if (aborted || failures.length > 0) {
              const message =
                failures.length > 0 && failures[0]?.status === 'rejected'
                  ? String((failures[0] as PromiseRejectedResult).reason)
                  : 'upload aborted';
              if (!res.headersSent) res.status(502).json({ error: message });
              return;
            }
            res.json({ uploaded });
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
  // DELETE /objects
  // ---------------------------------------------------------------------------

  const DeleteSchema = z.object({
    keys: z.array(z.string().min(1)).min(1).max(1000),
  });

  router.delete('/objects', async (req, res) => {
    let body: z.infer<typeof DeleteSchema>;
    try {
      body = DeleteSchema.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.issues });
        return;
      }
      throw err;
    }
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
    let body: z.infer<typeof CopySchema>;
    try {
      body = CopySchema.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.issues });
        return;
      }
      throw err;
    }
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
