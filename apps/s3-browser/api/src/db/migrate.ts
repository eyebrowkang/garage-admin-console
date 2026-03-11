import path from 'path';
import { fileURLToPath } from 'url';
import { migrate } from 'drizzle-orm/libsql/migrator';

import db from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In development (tsx): __dirname is api/src/db
// In production (compiled): __dirname is api/dist/db
// Migrations folder is always at api/drizzle
const migrationsFolder = path.resolve(__dirname, '../../drizzle');

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}
