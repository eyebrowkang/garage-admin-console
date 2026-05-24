import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * S3-compatible connection.
 *
 * `accessKeyId` and `secretAccessKey` are stored encrypted at rest via the
 * AES-256-GCM helper in `../encryption.ts`. List endpoints MUST exclude both
 * fields; only handlers that need to sign upstream S3 requests should decrypt.
 */
export const connections = sqliteTable('Connection', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  endpoint: text('endpoint').notNull(),
  region: text('region').notNull().default('us-east-1'),
  // forcePathStyle helps with non-AWS providers (Garage, MinIO, Ceph, etc).
  forcePathStyle: text('forcePathStyle').notNull().default('true'),
  accessKeyId: text('accessKeyId').notNull(),
  secretAccessKey: text('secretAccessKey').notNull(),
  createdAt: text('createdAt')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updatedAt')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const appSettings = sqliteTable('AppSettings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
