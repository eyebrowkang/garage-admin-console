import pino from 'pino';
import { env } from './config/env.js';

const base = { service: 'garage-admin-console-api' };

const transport = env.logPretty
  ? pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        singleLine: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    })
  : undefined;

const createLogger = (component: string, level: string) =>
  pino(
    {
      level,
      base: { ...base, component },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    transport,
  );

export const logger = createLogger('system', env.logLevel);
export const httpLogger = createLogger('http', 'info');
