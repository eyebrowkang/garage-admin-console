import express, { type Express } from 'express';
import { sql } from 'drizzle-orm';
import {
  createHttpLogMiddleware,
  createMultipartAwareJsonParser,
  createSecurityHeaders,
} from '@garage/server-config';

import { env } from './config/env.js';
import { httpLogger } from './logger.js';

import db from './db/index.js';
import authRouter from './routes/auth.js';
import connectionsRouter from './routes/connections.js';
import { authenticateToken } from './middleware/auth.middleware.js';

export const app: Express = express();

// Security response headers on every response (API + the served SPA).
app.use(createSecurityHeaders());

const httpLogMiddleware = createHttpLogMiddleware(env.httpLogFormat, httpLogger);

if (httpLogMiddleware) {
  app.use(httpLogMiddleware);
}

// JSON body parser. Mount BEFORE the buckets router so non-multipart routes
// (e.g. POST /presign, DELETE /objects, POST /copy) can read JSON. The
// upload handler short-circuits multipart/form-data so this doesn't fight
// busboy.
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

// Protected routes — connectionsRouter nests the Bucket Backend API under
// /:connId/buckets/:bucket so auth runs once for both surfaces.
app.use('/api/connections', authenticateToken, connectionsRouter);
