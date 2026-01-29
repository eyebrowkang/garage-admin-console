import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Check if any clusters exist
  const existingClusters = await prisma.cluster.count();
  if (existingClusters > 0) {
    console.log(`Database already has ${existingClusters} cluster(s). Skipping seed.`);
    return;
  }

  // No default clusters to seed - clusters must be added via the UI
  // This seed file is a placeholder for future seeding needs

  console.log('Database seed complete.');
  console.log('');
  console.log('To add a cluster, start the app and use the web interface:');
  console.log('  1. Run: pnpm dev');
  console.log('  2. Open: http://localhost:5173');
  console.log('  3. Login with your ADMIN_PASSWORD');
  console.log('  4. Click "Connect Cluster" to add a Garage cluster');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
