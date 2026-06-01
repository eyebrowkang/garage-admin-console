import { createServiceLoggers } from '@garage/server-config';
import { env } from './config/env.js';

export const { logger, httpLogger, createLogger } = createServiceLoggers({
  service: 'garage-admin-console-api',
  logLevel: env.logLevel,
  logPretty: env.logPretty,
});
