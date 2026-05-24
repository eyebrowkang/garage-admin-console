import path from 'path';
import { defineConfig } from 'drizzle-kit';

const dataDir = process.env.DATA_DIR || process.cwd();
const dbPath = path.resolve(dataDir, 'data.db');

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'turso',
  dbCredentials: {
    url: `file:${dbPath}`,
  },
});
