import { createCrypto } from '@garage/crypto';
import { env } from './config/env.js';

export const { encrypt, decrypt } = createCrypto(env.encryptionKey);
