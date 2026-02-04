import { PrismaClient } from '@prisma/client';
import { logger } from '../src/logger.js';

const prisma = new PrismaClient();

async function main() {
  logger.info('Seeding database...');

  // Check if any clusters exist
  const existingClusters = await prisma.cluster.count();
  if (existingClusters > 0) {
    logger.info(
      { count: existingClusters },
      'Database already has clusters. Skipping seed.',
    );
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

main()
  .catch((e) => {
    logger.error({ err: e }, 'Seed error');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
