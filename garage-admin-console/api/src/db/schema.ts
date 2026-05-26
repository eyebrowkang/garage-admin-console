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
  // S3 protocol endpoint (Garage's S3 port, e.g. http://host:3900) — separate
  // from the admin endpoint above. Required for object browsing via the
  // embedded FileBrowser; null clusters surface a helpful error message and
  // the rest of the Admin Console keeps working as before.
  s3Endpoint: text('s3Endpoint'),
  s3Region: text('s3Region'),
  // Stored as text so empty string round-trips cleanly. Defaults to true
  // (path-style) because that's what Garage uses out of the box.
  s3ForcePathStyle: text('s3ForcePathStyle'),
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
