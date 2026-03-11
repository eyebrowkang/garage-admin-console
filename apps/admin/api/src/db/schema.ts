import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const clusters = sqliteTable('Cluster', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  endpoint: text('endpoint').notNull(),
  adminToken: text('adminToken').notNull(),
  metricToken: text('metricToken'),
  createdAt: text('createdAt').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updatedAt')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const appSettings = sqliteTable('AppSettings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
