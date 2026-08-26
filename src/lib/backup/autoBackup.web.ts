/**
 * No automatic backup on web, by necessity rather than by omission: a browser cannot write a file
 * without a download prompt, and firing one every time a flight is edited would be hostile. The
 * Settings screen says so and offers the manual Export instead.
 */
export function startAutoBackup(): () => void {
  return () => {};
}
