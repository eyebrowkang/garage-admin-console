import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

import path from 'path';

const dataDir = process.env.DATA_DIR || process.cwd();
const dbPath = path.resolve(dataDir, 'data.db');
const dbUrl = `file:${dbPath}`;

// Use fixed database name and ignore external DATABASE_URL overrides.
process.env.DATABASE_URL = dbUrl;

type LibSqlClientWithUrl = ReturnType<typeof createClient> & { url: string };

const libsql = createClient({
  url: dbUrl,
}) as LibSqlClientWithUrl;

// PrismaLibSql reads .url from the client instance
libsql.url = dbUrl;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new PrismaLibSql(libsql as any);
const prisma = new PrismaClient({ adapter });

export default prisma;
