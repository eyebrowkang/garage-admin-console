import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

import path from 'path';

const dbPath = path.resolve(process.cwd(), 'dev.db');
const dbUrl = `file:${dbPath}`;

// Force env var for Prisma Schema validation if needed
process.env.DATABASE_URL = dbUrl;

type LibSqlClientWithUrl = ReturnType<typeof createClient> & { url?: string };

const libsql = createClient({
  url: dbUrl,
}) as LibSqlClientWithUrl;

// Hack: PrismaLibSql might read .url from client
libsql.url = dbUrl;

const adapter = new PrismaLibSql(libsql);
const prisma = new PrismaClient({ adapter });

export default prisma;
