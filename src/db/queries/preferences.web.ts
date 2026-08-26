import { loadPreferences, savePreferences } from '../webStorage';

/** localStorage twin of the native preferences table. See the native file for what this is for. */
export async function readPreference(key: string): Promise<string | undefined> {
  return loadPreferences()[key];
}

export async function writePreference(key: string, value: string): Promise<void> {
  savePreferences({ ...loadPreferences(), [key]: value });
}
