import express from 'express';
import morgan from 'morgan';

import { env } from './config/env.js';
import { httpLogger, logger } from './logger.js';

const app = express();
const PORT = env.port;

import clusterRouter from './routes/clusters.js';
import authRouter from './routes/auth.js';
import proxyRouter from './routes/proxy.js';
import { authenticateToken } from './middleware/auth.middleware.js';

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
app.use(express.json());

// Public routes
app.use('/auth', authRouter);
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Protected routes
app.use('/clusters', authenticateToken, clusterRouter);
app.use('/proxy', authenticateToken, proxyRouter);

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'BFF API running');
});
