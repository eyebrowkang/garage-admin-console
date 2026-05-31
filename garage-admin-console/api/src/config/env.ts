import dotenv from 'dotenv';
import { loadEnv } from '@garage/server-config';

dotenv.config({ quiet: true });

export const env = loadEnv(3001);
