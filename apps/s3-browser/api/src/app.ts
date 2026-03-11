import express, { type Express } from 'express';
import { sql } from 'drizzle-orm';

import db from './db/index.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';

export const app: Express = express();

app.use(express.json());

// Public routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.get('/api/health/db', async (_req, res) => {
  try {
    await db.run(sql`SELECT 1`);
    res.json({ status: 'ok', timestamp: new Date() });
  } catch {
    res.status(503).json({ status: 'error', timestamp: new Date() });
  }
});
