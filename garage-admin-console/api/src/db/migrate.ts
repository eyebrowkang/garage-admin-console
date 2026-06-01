import { runLibsqlMigrations } from '@garage/server-config';

import db from './index.js';

export async function runMigrations() {
  await runLibsqlMigrations(db, import.meta.url);
}
