import { getDocumentAsync } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { CabinCrewLogEntry } from '@/src/types/logbook';
import { NightWindow } from '@/src/lib/daynight/nightWindow';
import { BACKUP_FILE_NAME, serializeBackup } from './format';
import { buildLogbookHtml } from './pdfDoc';

/**
 * The live backup lives in the app's Documents directory rather than the cache, and `app.json`
 * turns on iOS file sharing for it — so it shows up under Files → On My iPhone → FA Logbook,
 * where the crew member can AirDrop it to a new phone without opening the app at all. A cache file
 * would be correct-looking and silently evictable.
 */
/** Whether the platform can keep a backup file up to date on its own. See the web twin. */
export const AUTO_BACKUP_SUPPORTED = true;

export function backupFile(): File {
  return new File(Paths.document, BACKUP_FILE_NAME);
}

export interface BackupFileStatus {
  exists: boolean;
  /** Bytes, for showing that the file is real and non-empty. */
  size?: number;
  modifiedAt?: Date;
}

export function readBackupStatus(): BackupFileStatus {
  const file = backupFile();
  if (!file.exists) return { exists: false };
  return { exists: true, size: file.size ?? undefined, modifiedAt: file.modificationTime ? new Date(file.modificationTime) : undefined };
}

/** Overwrites the live backup. Called both by the auto-backup and by the explicit Export button. */
export function writeBackup(entries: CabinCrewLogEntry[], nightWindow?: string): string {
  const file = backupFile();
  if (!file.exists) file.create({ intermediates: true, overwrite: true });
  file.write(serializeBackup(entries, { nightWindow }));
  return file.uri;
}

export async function shareBackup(entries: CabinCrewLogEntry[], nightWindow?: string): Promise<void> {
  const uri = writeBackup(entries, nightWindow);
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'FA Logbook backup',
  });
}

/** Returns the file's text, or undefined if the picker was cancelled the picker. */
export async function pickBackupText(): Promise<string | undefined> {
  // Not filtered to application/json: iOS often reports a .json received over AirDrop or from
  // another app as public.data, and a filter that hides the file the crew member just sent themselves
  // is worse than reading one that turns out not to be a backup — parseBackup says so plainly.
  const result = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return undefined;
  return new File(result.assets[0].uri).text();
}

export async function sharePdf(entries: CabinCrewLogEntry[], nightWindow?: NightWindow): Promise<void> {
  // A4 landscape in PostScript points — the logbook table needs the width.
  const { uri } = await Print.printToFileAsync({
    html: buildLogbookHtml(entries, { nightWindow }),
    width: 842,
    height: 595,
  });

  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Cabin Crew Logbook',
  });
}
