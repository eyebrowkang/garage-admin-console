import express from 'express';
import morgan from 'morgan';

import { env } from './config/env.js';
import { httpLogger } from './logger.js';

import clusterRouter from './routes/clusters.js';
import authRouter from './routes/auth.js';
import proxyRouter from './routes/proxy.js';
import { authenticateToken } from './middleware/auth.middleware.js';

export const app = express();

if (env.httpLogFormat) {
  app.use(
    morgan(env.httpLogFormat, {
      stream: {
        write: (message) => {
          httpLogger.info(message.trim());
        },
      },
    }),
  );
}

app.use(express.json({ strict: false }));

// Public routes
app.use('/auth', authRouter);
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Protected routes
app.use('/clusters', authenticateToken, clusterRouter);
app.use('/proxy', authenticateToken, proxyRouter);
