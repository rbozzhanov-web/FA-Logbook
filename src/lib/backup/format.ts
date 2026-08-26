import { z } from 'zod';

import { CabinCrewLogEntry } from '@/src/types/logbook';

/**
 * Bumped only when a change would stop an older app reading the file. Restore refuses a version
 * it does not know rather than guessing: a logbook is the record of hours worked, and
 * half-importing one is worse than importing none.
 */
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_APP_ID = 'fa-logbook';
export const BACKUP_FILE_NAME = 'fa-logbook-backup.json';

/** Counters are `.default(0)` so a file written before a field existed still restores. */
const minutes = z.number().int().min(0).default(0);
const optionalText = z.string().optional();

const entrySchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  kind: z.enum(['operating', 'deadhead', 'ground']).default('operating'),
  flightNumber: optionalText,
  departureAirport: z.string(),
  arrivalAirport: z.string(),
  aircraftType: optionalText,

  timeOut: optionalText,
  timeIn: optionalText,
  arrivalDate: optionalText,

  blockMinutes: minutes,
  deadheadMinutes: minutes,
  groundDutyMinutes: minutes,
  dayMinutes: minutes,
  nightMinutes: minutes,

  position: optionalText,
  dutyCode: optionalText,
  dutyStart: optionalText,
  dutyEnd: optionalText,
  dutySectorIndex: z.number().int().min(1).optional(),
  dutySectorCount: z.number().int().min(1).optional(),

  captainName: optionalText,
  purserName: optionalText,
  otherCrewNames: optionalText,
  remarks: optionalText,

  source: z.enum(['manual', 'pdf_import']).default('manual'),
  importBatchId: optionalText,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const backupSchema = z.object({
  app: z.literal(BACKUP_APP_ID),
  formatVersion: z.number().int(),
  exportedAt: z.string(),
  entryCount: z.number().int().min(0),
  /**
   * The night window the totals in this logbook were reported under, e.g. "22:00-06:00 station".
   * Carried with the entries because a night total means nothing without the rule behind it —
   * but it is not restored over the device's own setting, only recorded.
   */
  nightWindow: optionalText,
  entries: z.array(entrySchema),
});

export type BackupFile = z.infer<typeof backupSchema> & { entries: CabinCrewLogEntry[] };

export function buildBackup(
  entries: CabinCrewLogEntry[],
  options: { exportedAt?: string; nightWindow?: string } = {},
): BackupFile {
  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    entryCount: entries.length,
    nightWindow: options.nightWindow,
    entries,
  };
}

export function serializeBackup(
  entries: CabinCrewLogEntry[],
  options?: { exportedAt?: string; nightWindow?: string },
): string {
  return JSON.stringify(buildBackup(entries, options), null, 2);
}

export type BackupParseResult = { ok: true; backup: BackupFile } | { ok: false; error: string };

/**
 * Reads a backup file, reporting what is wrong instead of throwing — the caller is a settings
 * screen, and "Not an FA Logbook backup" is a more useful thing to show than a stack trace.
 */
export function parseBackup(raw: string): BackupParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
    return { ok: false, error: `That file is not an FA Logbook backup${where}.` };
  }

  if (parsed.data.formatVersion > BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `This backup was written by a newer version of the app (format ${parsed.data.formatVersion}). Update FA Logbook and try again.`,
    };
  }

  return { ok: true, backup: parsed.data as BackupFile };
}

export interface MergeResult {
  merged: CabinCrewLogEntry[];
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * Folds a backup into what is already stored, matched by id.
 *
 * A merge, not a replacement: restoring onto a phone that has flown since the backup was taken
 * must not delete those sectors. Because ids survive the round trip, restoring the same file
 * twice is a no-op rather than a doubled logbook.
 */
export function mergeBackup(
  existing: CabinCrewLogEntry[],
  incoming: CabinCrewLogEntry[],
): MergeResult {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const entry of incoming) {
    const current = byId.get(entry.id);
    if (!current) {
      added += 1;
      byId.set(entry.id, entry);
    } else if (JSON.stringify(current) === JSON.stringify(entry)) {
      unchanged += 1;
    } else {
      updated += 1;
      byId.set(entry.id, entry);
    }
  }

  return { merged: [...byId.values()], added, updated, unchanged };
}
