import { getDocumentAsync } from 'expo-document-picker';

import { CabinCrewLogEntry } from '@/src/types/logbook';
import { NightWindow } from '@/src/lib/daynight/nightWindow';
import { BACKUP_FILE_NAME, serializeBackup } from './format';
import { buildLogbookHtml } from './pdfDoc';
import type { BackupFileStatus } from './backupFile';

export type { BackupFileStatus };

/**
 * A browser has no app-private Documents directory and cannot write a file without asking, so
 * there is no "live backup file" to report on here. The web build's backup is whatever was
 * last downloaded — which the app cannot see. Saying so is better than inventing a timestamp.
 */
export const AUTO_BACKUP_SUPPORTED = false;

export function readBackupStatus(): BackupFileStatus {
  return { exists: false };
}

function download(filename: string, content: string, mimeType: string): string {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick: revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return url;
}

export function writeBackup(entries: CabinCrewLogEntry[], nightWindow?: string): string {
  return download(BACKUP_FILE_NAME, serializeBackup(entries, { nightWindow }), 'application/json');
}

export async function shareBackup(entries: CabinCrewLogEntry[], nightWindow?: string): Promise<void> {
  // Sharing.shareAsync cannot share a local file on web, so the download *is* the share.
  writeBackup(entries, nightWindow);
}

export async function pickBackupText(): Promise<string | undefined> {
  const result = await getDocumentAsync({ type: 'application/json', multiple: false });
  if (result.canceled || !result.assets?.[0]) return undefined;

  const asset = result.assets[0];
  // On web the picker hands back a real File object; its uri is a blob: URL that fetch can read
  // too, but the File is the direct route.
  if (asset.file) return asset.file.text();
  return fetch(asset.uri).then((response) => response.text());
}

/**
 * Prints through a hidden iframe rather than expo-print: on web `printToFileAsync` hands the page
 * to the browser's print dialog instead of returning a PDF, and an iframe lets us print *our*
 * document rather than the app around it. "Save as PDF" in that dialog produces the same file.
 */
export async function sharePdf(entries: CabinCrewLogEntry[], nightWindow?: NightWindow): Promise<void> {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(buildLogbookHtml(entries, { nightWindow }));
  doc.close();

  await new Promise((resolve) => setTimeout(resolve, 100));
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  // Left in the DOM briefly: removing it while the print dialog is open cancels the job.
  setTimeout(() => frame.remove(), 60_000);
}
