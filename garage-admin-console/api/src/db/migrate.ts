import { runSqliteMigrations } from '@garage/server-config';

import db from './index.js';

export async function runMigrations() {
  await runSqliteMigrations(db, import.meta.url);
}
