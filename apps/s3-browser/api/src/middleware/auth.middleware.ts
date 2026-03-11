import { createAuthMiddleware } from '@garage-admin/auth';
import { env } from '../config/env.js';

export const authenticateToken = createAuthMiddleware({
  jwtSecret: env.jwtSecret,
});
