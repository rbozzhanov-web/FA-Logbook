import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';

import * as schema from './schema';

type Database = ReturnType<typeof drizzle>;
let cached: Database | undefined;

/**
 * Opens the DB lazily so a failure surfaces inside a React render/effect (where migrate.ts's
 * useMigrations already catches and displays it) instead of at module-eval time, which happens
 * before React mounts and can't be caught by any error boundary.
 */
export function getDb(): Database {
  if (!cached) {
    const sqliteDb = openDatabaseSync('fa-logbook.db', { enableChangeListener: true });
    cached = drizzle(sqliteDb, { schema });
  }
  return cached;
}
