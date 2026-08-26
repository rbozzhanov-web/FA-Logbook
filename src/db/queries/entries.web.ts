import { v4 as uuidv4 } from 'uuid';

import { collectCrewNames } from '@/src/lib/crewNames';
import { CabinCrewLogEntry } from '@/src/types/logbook';
import { bumpDataVersion } from '../dataVersion';
import { loadEntries, saveEntries } from '../webStorage';

export type { NewLogEntry } from './entries';
import type { NewLogEntry } from './entries';

export async function listEntries(range?: { from?: string; to?: string }): Promise<CabinCrewLogEntry[]> {
  let entries = loadEntries();
  if (range?.from) entries = entries.filter((e) => e.date >= range.from!);
  if (range?.to) entries = entries.filter((e) => e.date <= range.to!);

  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const aTime = a.timeOut ?? '';
    const bTime = b.timeOut ?? '';
    return aTime < bTime ? 1 : aTime > bTime ? -1 : 0;
  });
}

export async function getEntry(id: string): Promise<CabinCrewLogEntry | undefined> {
  return loadEntries().find((e) => e.id === id);
}

function toEntry(entry: NewLogEntry, id: string, now: string): CabinCrewLogEntry {
  return { ...entry, id, createdAt: now, updatedAt: now };
}

export async function createEntry(entry: NewLogEntry): Promise<CabinCrewLogEntry> {
  const now = new Date().toISOString();
  const row = toEntry(entry, uuidv4(), now);
  saveEntries([...loadEntries(), row]);
  bumpDataVersion();
  return row;
}

/** Bulk insert used by the PDF import commit step; every row shares the caller-supplied importBatchId. */
export async function createEntries(entries: NewLogEntry[]): Promise<CabinCrewLogEntry[]> {
  const now = new Date().toISOString();
  const rows = entries.map((entry) => toEntry(entry, uuidv4(), now));
  if (rows.length === 0) return [];
  saveEntries([...loadEntries(), ...rows]);
  bumpDataVersion();
  return rows;
}

export async function updateEntry(id: string, entry: NewLogEntry): Promise<CabinCrewLogEntry> {
  const existing = loadEntries();
  const previous = existing.find((e) => e.id === id);
  const now = new Date().toISOString();
  const row = toEntry(entry, id, previous?.createdAt ?? now);
  row.updatedAt = now;
  saveEntries(existing.map((e) => (e.id === id ? row : e)));
  bumpDataVersion();
  return row;
}

export async function deleteEntry(id: string): Promise<void> {
  saveEntries(loadEntries().filter((e) => e.id !== id));
  bumpDataVersion();
}

export async function deleteImportBatch(importBatchId: string): Promise<void> {
  saveEntries(loadEntries().filter((e) => e.importBatchId !== importBatchId));
  bumpDataVersion();
}

export async function listImportBatches(): Promise<{ importBatchId: string; count: number; date: string }[]> {
  const rows = loadEntries().filter((e) => e.source === 'pdf_import');

  const batches = new Map<string, { count: number; date: string }>();
  for (const row of rows) {
    if (!row.importBatchId) continue;
    const existing = batches.get(row.importBatchId);
    if (existing) {
      existing.count += 1;
      if (row.createdAt > existing.date) existing.date = row.createdAt;
    } else {
      batches.set(row.importBatchId, { count: 1, date: row.createdAt });
    }
  }

  return Array.from(batches.entries())
    .map(([importBatchId, value]) => ({ importBatchId, ...value }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Every crew name already in the logbook, most-flown-with first. See the native twin. */
export async function listCrewNames(): Promise<string[]> {
  return collectCrewNames(loadEntries());
}

/**
 * Writes backup entries over whatever shares their id, leaving every other row alone. Ids and
 * timestamps come from the backup, so restoring the same file twice is a no-op.
 */
export async function restoreEntries(entries: CabinCrewLogEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const byId = new Map(loadEntries().map((entry) => [entry.id, entry]));
  for (const entry of entries) byId.set(entry.id, entry);

  saveEntries([...byId.values()]);
  bumpDataVersion();
}

/** The destructive restore: the backup becomes the whole logbook. Always confirmed by the caller. */
export async function replaceAllEntries(entries: CabinCrewLogEntry[]): Promise<void> {
  saveEntries(entries);
  bumpDataVersion();
}
