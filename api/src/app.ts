import express from 'express';
import morgan from 'morgan';

import { env } from './config/env.js';
import { httpLogger } from './logger.js';

import clusterRouter from './routes/clusters.js';
import authRouter from './routes/auth.js';
import proxyRouter from './routes/proxy.js';
import { authenticateToken } from './middleware/auth.middleware.js';

export const app = express();
const ANSI_COLOR_PATTERN = new RegExp(String.raw`\u001B\[[0-9;]*m`, 'g');
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

app.use(express.json());

// Public routes
app.use('/auth', authRouter);
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Protected routes
app.use('/clusters', authenticateToken, clusterRouter);
app.use('/proxy', authenticateToken, proxyRouter);
