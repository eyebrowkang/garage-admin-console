import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

import path from 'path';

const dbPath = path.resolve(process.cwd(), 'data.db');
const dbUrl = `file:${dbPath}`;

// Use fixed database name and ignore external DATABASE_URL overrides.
process.env.DATABASE_URL = dbUrl;

type LibSqlClientWithUrl = ReturnType<typeof createClient> & { url: string };

const libsql = createClient({
  url: dbUrl,
}) as LibSqlClientWithUrl;

// Hack: PrismaLibSql might read .url from client
libsql.url = dbUrl;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new PrismaLibSql(libsql as any);
const prisma = new PrismaClient({ adapter });

export default prisma;
