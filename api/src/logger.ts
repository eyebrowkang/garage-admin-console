import pino from 'pino';
import { env } from './config/env.js';

const base = { service: 'garage-admin-console-api' };

export const logger = pino({
  level: env.logLevel,
  base: { ...base, component: 'system' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const httpLogger = pino({
  level: 'info',
  base: { ...base, component: 'http' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
