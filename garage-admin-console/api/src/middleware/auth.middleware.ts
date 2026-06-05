import { createAuthenticateToken } from '@garage/server-config';
import { env } from '../config/env.js';

export const authenticateToken = createAuthenticateToken(env.jwtSecret);
