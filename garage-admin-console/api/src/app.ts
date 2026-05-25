import express, { type Express } from 'express';
import morgan from 'morgan';
import { sql } from 'drizzle-orm';

import { env } from './config/env.js';
import { httpLogger } from './logger.js';

import db from './db/index.js';
import clusterRouter from './routes/clusters.js';
import authRouter from './routes/auth.js';
import proxyRouter from './routes/proxy.js';
import bucketRouter from './routes/buckets.js';
import { authenticateToken } from './middleware/auth.middleware.js';

export const app: Express = express();
const ANSI_COLOR_PATTERN = new RegExp(String.raw`\[[0-9;]*m`, 'g');
const stripAnsi = (value: string) => value.replace(ANSI_COLOR_PATTERN, '');

if (env.httpLogFormat) {
  app.use(
    morgan(env.httpLogFormat, {
      stream: {
        write: (message) => {
          const cleaned = stripAnsi(message).trim();
          if (cleaned) {
            httpLogger.info(cleaned);
          }
        },
      },
    }),
  );
}

// JSON body parser. The proxy needs to forward valid JSON primitives (e.g.
// top-level strings), so strict mode is off. Multipart uploads (the
// embedded FileBrowser's POST /upload) need busboy to read the raw stream,
// so skip JSON parsing for that content type.
app.use(
  express.json({
    strict: false,
    type: (req) => {
      const contentType = req.headers['content-type'] ?? '';
      return !contentType.toLowerCase().startsWith('multipart/form-data');
    },
  }),
);

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
// Bucket Backend API — §2.4. Mounted at /api/clusters/:clusterId/buckets/:bucket
// (distinct from clusterRouter so the routers stay focused).
app.use('/api/clusters/:clusterId/buckets/:bucket', authenticateToken, bucketRouter);
