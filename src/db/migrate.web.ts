/** Web has no local DB to migrate — storage is a flat localStorage-backed store (see webStorage.ts). */
export function useDatabaseMigrations() {
  return { success: true, error: undefined as Error | undefined };
}
