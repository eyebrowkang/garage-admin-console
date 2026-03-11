import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const connections = sqliteTable('Connection', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  endpoint: text('endpoint').notNull(),
  region: text('region'),
  accessKeyId: text('accessKeyId').notNull(),
  secretAccessKey: text('secretAccessKey').notNull(),
  bucket: text('bucket'),
  pathStyle: integer('pathStyle', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updatedAt')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
