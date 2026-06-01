import { createLibsqlDb } from '@garage/server-config';

import * as schema from './schema.js';

export default createLibsqlDb(schema);
