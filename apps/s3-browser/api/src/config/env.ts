import { z } from 'zod/v4';

const envSchema = z.object({
  PORT: z.coerce.number().default(3002),
  JWT_SECRET: z.string().min(8),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = envSchema.parse(process.env);
