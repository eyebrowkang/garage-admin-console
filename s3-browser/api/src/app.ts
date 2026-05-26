import express, { type Express } from 'express';
import morgan from 'morgan';
import { sql } from 'drizzle-orm';

import { env } from './config/env.js';
import { httpLogger } from './logger.js';

import db from './db/index.js';
import authRouter from './routes/auth.js';
import connectionsRouter from './routes/connections.js';
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

// JSON body parser. Mount BEFORE the buckets router so non-multipart routes
// (e.g. POST /presign, DELETE /objects, POST /copy) can read JSON. The
// upload handler short-circuits multipart/form-data so this doesn't fight
// busboy.
app.use(
  express.json({
    strict: false,
    // Skip JSON parsing for multipart uploads — busboy needs the raw stream.
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

// Protected routes — connectionsRouter nests the Bucket Backend API under
// /:connId/buckets/:bucket so auth runs once for both surfaces.
app.use('/api/connections', authenticateToken, connectionsRouter);
