import { count } from 'drizzle-orm';
import pino from 'pino';

import db from './index.js';
import { clusters } from './schema.js';
import { runMigrations } from './migrate.js';

const logger = pino({
  level: 'info',
  base: { service: 'garage-admin-console-api', component: 'seed' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

async function main() {
  logger.info('Running migrations...');
  await runMigrations();

  logger.info('Seeding database...');

  // Check if any clusters exist
  const [result] = await db.select({ value: count() }).from(clusters);
  if (result && result.value > 0) {
    logger.info({ count: result.value }, 'Database already has clusters. Skipping seed.');
    return;
  }

  // No default clusters to seed - clusters must be added via the UI
  // This seed file is a placeholder for future seeding needs

  logger.info('Database seed complete.');
  logger.info('To add a cluster, start the app and use the web interface:');
  logger.info('  1. Run: pnpm dev');
  logger.info('  2. Open: http://localhost:5173');
  logger.info('  3. Login with your ADMIN_PASSWORD');
  logger.info('  4. Click "Connect Cluster" to add a Garage cluster');
}

main().catch((e) => {
  logger.error({ err: e }, 'Seed error');
  process.exit(1);
});
