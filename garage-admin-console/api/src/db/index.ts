import path from 'path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema.js';

const dataDir = process.env.DATA_DIR || process.cwd();
const dbPath = path.resolve(dataDir, 'data.db');
const dbUrl = `file:${dbPath}`;

const client = createClient({ url: dbUrl });
const db = drizzle({ client, schema });

export default db;
