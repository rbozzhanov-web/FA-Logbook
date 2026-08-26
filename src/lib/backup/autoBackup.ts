import { subscribeToDataVersion } from '@/src/db/dataVersion';
import { listEntries } from '@/src/db/queries/entries';
import { serializeNightWindow } from '@/src/lib/daynight/nightWindow';
import { readNightWindow } from '@/src/lib/settings';
import { writeBackup } from './backupFile';

/**
 * Long enough that editing several fields of one entry writes the file once, short enough that
 * the backup is current by the time anyone goes looking for it.
 */
const DEBOUNCE_MS = 3000;

let timer: ReturnType<typeof setTimeout> | undefined;
let writing = false;

async function writeNow(): Promise<void> {
  // A second change landing mid-write would otherwise interleave two serializations into one
  // file; the trailing debounce means the newer data is written straight after instead.
  if (writing) return;
  writing = true;
  try {
    const [entries, nightWindow] = await Promise.all([listEntries(), readNightWindow()]);
    writeBackup(entries, serializeNightWindow(nightWindow));
  } catch {
    // A failed backup must never take the app down or interrupt what the crew member was doing. The
    // Settings screen shows the file's real state, so a silent failure is visible there.
  } finally {
    writing = false;
  }
}

/**
 * Keeps a restorable copy of the logbook on disk, rewritten whenever anything changes.
 *
 * This is what makes "move to another device" work without anyone remembering to export:
 * the file is always current, and iOS file sharing puts it in the Files app.
 */
export function startAutoBackup(): () => void {
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void writeNow();
    }, DEBOUNCE_MS);
  };

  // Once at startup too, so a logbook that is never edited again still has a backup.
  void writeNow();

  const unsubscribe = subscribeToDataVersion(schedule);
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
}
