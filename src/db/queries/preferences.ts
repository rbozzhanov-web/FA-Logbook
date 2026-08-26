import { eq } from 'drizzle-orm';

import { getDb } from '../client';
import { preferences } from '../schema';

/**
 * Settings that change how the logbook's own figures are reported.
 *
 * Kept in the database alongside the entries rather than in device storage, because a night
 * total means nothing without the rule it was counted under — the two belong together, and the
 * backup carries both.
 */
export async function readPreference(key: string): Promise<string | undefined> {
  const rows = await getDb().select().from(preferences).where(eq(preferences.key, key)).limit(1);
  return rows[0]?.value;
}

export async function writePreference(key: string, value: string): Promise<void> {
  await getDb()
    .insert(preferences)
    .values({ key, value })
    .onConflictDoUpdate({ target: preferences.key, set: { value } });
}
