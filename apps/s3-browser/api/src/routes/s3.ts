import { Router, type Router as ExpressRouter } from 'express';
import {
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import busboy from 'busboy';
import { Readable } from 'stream';
import { getConnectionWithCredentials } from './connections.js';
import { createS3Client } from '../lib/s3-client.js';

const router: ExpressRouter = Router();

// Helper to get S3 client from connection ID
async function getClientAndConnection(connectionId: string) {
  const conn = await getConnectionWithCredentials(connectionId);
  if (!conn) return null;
  const client = createS3Client(conn);
  return { client, connection: conn };
}

// GET /api/s3/:connectionId/buckets — List buckets
router.get('/:connectionId/buckets', async (req, res) => {
  try {
    const result = await getClientAndConnection(req.params.connectionId);
    if (!result) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const response = await result.client.send(new ListBucketsCommand({}));
    res.json({
      buckets: (response.Buckets ?? []).map((b) => ({
        name: b.Name,
        creationDate: b.CreationDate,
      })),
    });
  } catch (error) {
    console.error('Failed to list buckets:', error);
    const message = error instanceof Error ? error.message : 'Failed to list buckets';
    res.status(502).json({ error: message });
  }
});

// GET /api/s3/:connectionId/objects — List objects in a bucket
router.get('/:connectionId/objects', async (req, res) => {
  try {
    const bucket = req.query.bucket as string;
    const prefix = (req.query.prefix as string) || '';
    const continuationToken = req.query.continuationToken as string | undefined;
    const maxKeys = Math.min(Number(req.query.maxKeys) || 1000, 1000);

    if (!bucket) {
      return res.status(400).json({ error: 'bucket query parameter is required' });
    }

    const result = await getClientAndConnection(req.params.connectionId);
    if (!result) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const response = await result.client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: '/',
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
      }),
    );

    res.json({
      objects: (response.Contents ?? []).map((obj) => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
        etag: obj.ETag,
        storageClass: obj.StorageClass,
      })),
      commonPrefixes: (response.CommonPrefixes ?? []).map((p) => p.Prefix),
      isTruncated: response.IsTruncated ?? false,
      nextContinuationToken: response.NextContinuationToken,
      prefix,
      bucket,
    });
  } catch (error) {
    console.error('Failed to list objects:', error);
    const message = error instanceof Error ? error.message : 'Failed to list objects';
    res.status(502).json({ error: message });
  }
});

// GET /api/s3/:connectionId/objects/download — Download an object
router.get('/:connectionId/objects/download', async (req, res) => {
  try {
    const bucket = req.query.bucket as string;
    const key = req.query.key as string;

    if (!bucket || !key) {
      return res.status(400).json({ error: 'bucket and key query parameters are required' });
    }

    const result = await getClientAndConnection(req.params.connectionId);
    if (!result) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const response = await result.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );

    if (!response.Body) {
      return res.status(404).json({ error: 'Object body is empty' });
    }

    // Set response headers
    const filename = key.split('/').pop() || 'download';
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    if (response.ContentType) res.setHeader('Content-Type', response.ContentType);
    if (response.ContentLength) res.setHeader('Content-Length', String(response.ContentLength));
    if (response.ETag) res.setHeader('ETag', response.ETag);

    // Stream the body
    const stream = response.Body as Readable;
    stream.pipe(res);
  } catch (error) {
    console.error('Failed to download object:', error);
    const message = error instanceof Error ? error.message : 'Failed to download object';
    res.status(502).json({ error: message });
  }
});

// GET /api/s3/:connectionId/objects/info — Get object metadata
router.get('/:connectionId/objects/info', async (req, res) => {
  try {
    const bucket = req.query.bucket as string;
    const key = req.query.key as string;

    if (!bucket || !key) {
      return res.status(400).json({ error: 'bucket and key query parameters are required' });
    }

    const result = await getClientAndConnection(req.params.connectionId);
    if (!result) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const response = await result.client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );

    res.json({
      key,
      bucket,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      etag: response.ETag,
      metadata: response.Metadata,
      storageClass: response.StorageClass,
    });
  } catch (error) {
    console.error('Failed to get object info:', error);
    const message = error instanceof Error ? error.message : 'Failed to get object info';
    res.status(502).json({ error: message });
  }
});

// POST /api/s3/:connectionId/objects/upload — Upload a file (streaming multipart)
router.post('/:connectionId/objects/upload', async (req, res) => {
  try {
    const connectionId = req.params.connectionId as string;

    const result = await getClientAndConnection(connectionId);
    if (!result) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5 GB
    });

    let bucket = '';
    let key = '';
    let uploadStarted = false;
    let uploadResult: { success: boolean; key: string; bucket: string } | null = null;
    let uploadError: Error | null = null;

    bb.on('field', (name: string, val: string) => {
      if (name === 'bucket') bucket = val;
      if (name === 'key') key = val;
    });

    bb.on('file', (_name: string, fileStream: Readable, info: { mimeType: string }) => {
      if (uploadStarted) {
        fileStream.resume(); // drain extra files
        return;
      }
      uploadStarted = true;

      // Defer upload start to allow fields to be parsed first
      // busboy emits fields before files in order, but we use a microtask to be safe
      const doUpload = async () => {
        if (!bucket || !key) {
          uploadError = new Error('bucket and key fields are required');
          fileStream.resume();
          return;
        }

        try {
          const upload = new Upload({
            client: result.client,
            params: {
              Bucket: bucket,
              Key: key,
              Body: fileStream,
              ContentType: info.mimeType || 'application/octet-stream',
            },
            queueSize: 4,
            partSize: 10 * 1024 * 1024, // 10 MB parts
            leavePartsOnError: false,
          });

          await upload.done();
          uploadResult = { success: true, key, bucket };
        } catch (err) {
          uploadError = err instanceof Error ? err : new Error(String(err));
        }
      };

      doUpload();
    });

    bb.on('finish', async () => {
      // Wait for upload to complete
      const waitForUpload = async () => {
        // Simple poll — upload is async, wait for it
        for (let i = 0; i < 6000; i++) {
          if (uploadResult || uploadError) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      };

      await waitForUpload();

      if (uploadError) {
        console.error('Failed to upload object:', uploadError);
        res.status(502).json({ error: uploadError.message });
      } else if (uploadResult) {
        res.json(uploadResult);
      } else if (!uploadStarted) {
        res.status(400).json({ error: 'No file provided' });
      } else {
        res.status(504).json({ error: 'Upload timed out' });
      }
    });

    bb.on('error', (err: Error) => {
      console.error('Busboy error:', err);
      res.status(400).json({ error: err.message });
    });

    req.pipe(bb);
  } catch (error) {
    console.error('Failed to upload object:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload object';
    res.status(502).json({ error: message });
  }
});

// POST /api/s3/:connectionId/objects/folder — Create a folder (empty object with trailing /)
router.post('/:connectionId/objects/folder', async (req, res) => {
  try {
    const { bucket, prefix } = req.body as { bucket: string; prefix: string };

    if (!bucket || !prefix) {
      return res.status(400).json({ error: 'bucket and prefix are required' });
    }

    const folderKey = prefix.endsWith('/') ? prefix : `${prefix}/`;

    const result = await getClientAndConnection(req.params.connectionId);
    if (!result) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    await result.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: folderKey,
        Body: '',
        ContentType: 'application/x-directory',
      }),
    );

    res.json({ success: true, key: folderKey, bucket });
  } catch (error) {
    console.error('Failed to create folder:', error);
    const message = error instanceof Error ? error.message : 'Failed to create folder';
    res.status(502).json({ error: message });
  }
});

// DELETE /api/s3/:connectionId/objects — Delete an object
router.delete('/:connectionId/objects', async (req, res) => {
  try {
    const bucket = req.query.bucket as string;
    const key = req.query.key as string;

    if (!bucket || !key) {
      return res.status(400).json({ error: 'bucket and key query parameters are required' });
    }

    const result = await getClientAndConnection(req.params.connectionId);
    if (!result) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    await result.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );

    res.json({ success: true, key, bucket });
  } catch (error) {
    console.error('Failed to delete object:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete object';
    res.status(502).json({ error: message });
  }
});

export default router;
