import express, { type Express } from 'express';
import { sql } from 'drizzle-orm';
import { createHttpLogMiddleware, createMultipartAwareJsonParser } from '@garage/server-config';

import { env } from './config/env.js';
import { httpLogger } from './logger.js';

import db from './db/index.js';
import clusterRouter from './routes/clusters.js';
import authRouter from './routes/auth.js';
import proxyRouter from './routes/proxy.js';
import bucketRouter from './routes/buckets.js';
import { authenticateToken } from './middleware/auth.middleware.js';

export const app: Express = express();
const httpLogMiddleware = createHttpLogMiddleware(env.httpLogFormat, httpLogger);

if (httpLogMiddleware) {
  app.use(httpLogMiddleware);
}

// JSON body parser. The proxy needs to forward valid JSON primitives (e.g.
// top-level strings), so strict mode is off. Multipart uploads (the
// embedded FileBrowser's POST /upload) need busboy to read the raw stream,
// so skip JSON parsing for that content type.
app.use(createMultipartAwareJsonParser());

// Public routes
app.use('/api/auth', authRouter);
app.get('/api/health', async (_req, res) => {
  try {
    await db.run(sql`SELECT 1`);
    res.json({ status: 'ok', timestamp: new Date() });
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date() });
  }
});

// Protected routes
app.use('/api/clusters', authenticateToken, clusterRouter);
app.use('/api/proxy', authenticateToken, proxyRouter);
// Bucket Backend API — mounted at /api/clusters/:clusterId/buckets/:bucket
// (distinct from clusterRouter so the routers stay focused).
app.use('/api/clusters/:clusterId/buckets/:bucket', authenticateToken, bucketRouter);
