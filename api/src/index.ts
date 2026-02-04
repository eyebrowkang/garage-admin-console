import { env } from './config/env.js';
import { logger } from './logger.js';
import { app } from './app.js';

const PORT = env.port;

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'BFF API running');
});
