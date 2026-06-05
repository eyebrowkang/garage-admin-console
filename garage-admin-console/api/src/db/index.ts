import { createSqliteDb } from '@garage/server-config';

import * as schema from './schema.js';

export default createSqliteDb(schema);
