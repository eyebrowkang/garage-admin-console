import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

import path from 'path';

const dbPath = path.resolve(process.cwd(), 'dev.db');
const dbUrl = `file:${dbPath}`;

// Force env var for Prisma Schema validation if needed
process.env.DATABASE_URL = dbUrl;

const libsql = createClient({
    url: dbUrl,
});

// Hack: PrismaLibSql might read .url from client
(libsql as any).url = dbUrl;

const adapter = new PrismaLibSql(libsql as any);
const prisma = new PrismaClient({ adapter });

export default prisma;
