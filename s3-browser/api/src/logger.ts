import { createServiceLoggers } from '@garage/server-config';
import { env } from './config/env.js';

export const { logger, httpLogger, createLogger } = createServiceLoggers({
  service: 's3-browser-api',
  logLevel: env.logLevel,
  logPretty: env.logPretty,
});
