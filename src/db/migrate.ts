import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from '../../drizzle/migrations';
import { getDb } from './client';

/** Runs pending Drizzle migrations against the local SQLite DB; call once at app boot. */
export function useDatabaseMigrations() {
  return useMigrations(getDb(), migrations);
}
