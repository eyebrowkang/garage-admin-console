import { createAuthRouter } from '@garage/server-config';
import { env } from '../config/env.js';

export default createAuthRouter({
  adminPassword: env.adminPassword,
  jwtSecret: env.jwtSecret,
});
