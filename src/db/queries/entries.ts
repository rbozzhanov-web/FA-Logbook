import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { collectCrewNames } from '@/src/lib/crewNames';
import { CabinCrewLogEntry, SectorKind } from '@/src/types/logbook';
import { getDb } from '../client';
import { bumpDataVersion } from '../dataVersion';
import { logEntries } from '../schema';

export type NewLogEntry = Omit<CabinCrewLogEntry, 'id' | 'createdAt' | 'updatedAt'>;

function toRow(entry: NewLogEntry, id: string, now: string) {
  return {
    id,
    date: entry.date,
    kind: entry.kind,
    flightNumber: entry.flightNumber ?? null,
    departureAirport: entry.departureAirport,
    arrivalAirport: entry.arrivalAirport,
    aircraftType: entry.aircraftType ?? null,
    timeOut: entry.timeOut ?? null,
    timeIn: entry.timeIn ?? null,
    arrivalDate: entry.arrivalDate ?? null,
    blockMinutes: entry.blockMinutes,
    deadheadMinutes: entry.deadheadMinutes,
    groundDutyMinutes: entry.groundDutyMinutes,
    dayMinutes: entry.dayMinutes,
    nightMinutes: entry.nightMinutes,
    position: entry.position ?? null,
    dutyCode: entry.dutyCode ?? null,
    dutyStart: entry.dutyStart ?? null,
    dutyEnd: entry.dutyEnd ?? null,
    dutySectorIndex: entry.dutySectorIndex ?? null,
    dutySectorCount: entry.dutySectorCount ?? null,
    captainName: entry.captainName ?? null,
    purserName: entry.purserName ?? null,
    otherCrewNames: entry.otherCrewNames ?? null,
    remarks: entry.remarks ?? null,
    source: entry.source,
    importBatchId: entry.importBatchId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function fromRow(row: typeof logEntries.$inferSelect): CabinCrewLogEntry {
  return {
    id: row.id,
    date: row.date,
    kind: row.kind as SectorKind,
    flightNumber: row.flightNumber ?? undefined,
    departureAirport: row.departureAirport,
    arrivalAirport: row.arrivalAirport,
    aircraftType: row.aircraftType ?? undefined,
    timeOut: row.timeOut ?? undefined,
    timeIn: row.timeIn ?? undefined,
    arrivalDate: row.arrivalDate ?? undefined,
    blockMinutes: row.blockMinutes,
    deadheadMinutes: row.deadheadMinutes,
    groundDutyMinutes: row.groundDutyMinutes,
    dayMinutes: row.dayMinutes,
    nightMinutes: row.nightMinutes,
    position: row.position ?? undefined,
    dutyCode: row.dutyCode ?? undefined,
    dutyStart: row.dutyStart ?? undefined,
    dutyEnd: row.dutyEnd ?? undefined,
    dutySectorIndex: row.dutySectorIndex ?? undefined,
    dutySectorCount: row.dutySectorCount ?? undefined,
    captainName: row.captainName ?? undefined,
    purserName: row.purserName ?? undefined,
    otherCrewNames: row.otherCrewNames ?? undefined,
    remarks: row.remarks ?? undefined,
    source: row.source as CabinCrewLogEntry['source'],
    importBatchId: row.importBatchId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listEntries(range?: { from?: string; to?: string }): Promise<CabinCrewLogEntry[]> {
  const conditions = [];
  if (range?.from) conditions.push(gte(logEntries.date, range.from));
  if (range?.to) conditions.push(lte(logEntries.date, range.to));

  const rows = await getDb()
    .select()
    .from(logEntries)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(logEntries.date), desc(logEntries.timeOut));

  return rows.map(fromRow);
}

export async function getEntry(id: string): Promise<CabinCrewLogEntry | undefined> {
  const rows = await getDb().select().from(logEntries).where(eq(logEntries.id, id)).limit(1);
  return rows[0] ? fromRow(rows[0]) : undefined;
}

export async function createEntry(entry: NewLogEntry): Promise<CabinCrewLogEntry> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const row = toRow(entry, id, now);
  await getDb().insert(logEntries).values(row);
  bumpDataVersion();
  return fromRow(row);
}

/** Bulk insert used by the PDF import commit step; every row shares the caller-supplied importBatchId. */
export async function createEntries(entries: NewLogEntry[]): Promise<CabinCrewLogEntry[]> {
  const now = new Date().toISOString();
  const rows = entries.map((entry) => toRow(entry, uuidv4(), now));
  if (rows.length === 0) return [];
  await getDb().insert(logEntries).values(rows);
  bumpDataVersion();
  return rows.map(fromRow);
}

export async function updateEntry(id: string, entry: NewLogEntry): Promise<CabinCrewLogEntry> {
  const existing = await getEntry(id);
  const now = new Date().toISOString();
  const row = toRow(entry, id, existing?.createdAt ?? now);
  row.updatedAt = now;
  await getDb().update(logEntries).set(row).where(eq(logEntries.id, id));
  bumpDataVersion();
  return fromRow(row);
}

export async function deleteEntry(id: string): Promise<void> {
  await getDb().delete(logEntries).where(eq(logEntries.id, id));
  bumpDataVersion();
}

export async function deleteImportBatch(importBatchId: string): Promise<void> {
  await getDb().delete(logEntries).where(eq(logEntries.importBatchId, importBatchId));
  bumpDataVersion();
}

export async function listImportBatches(): Promise<{ importBatchId: string; count: number; date: string }[]> {
  const rows = await getDb().select().from(logEntries).where(eq(logEntries.source, 'pdf_import'));

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

/**
 * Every crew name already in the logbook, most-flown-with first, for the entry form's suggestions.
 *
 * Only the three name columns are selected — there is no index on them, so this is a full scan,
 * and there is no reason to drag every column through it.
 */
export async function listCrewNames(): Promise<string[]> {
  const rows = await getDb()
    .select({
      captainName: logEntries.captainName,
      purserName: logEntries.purserName,
      otherCrewNames: logEntries.otherCrewNames,
    })
    .from(logEntries);

  return collectCrewNames(rows);
}

/**
 * SQLite caps the parameters in one statement; at ~29 columns a row this stays comfortably under
 * even the old 999-variable limit's modern successor.
 */
const RESTORE_CHUNK_SIZE = 100;

function toRestoredRow(entry: CabinCrewLogEntry) {
  // Unlike createEntries, the id and both timestamps come from the backup: a restore has to be
  // idempotent, and regenerating ids would turn every restore into a duplicated logbook.
  const row = toRow(entry, entry.id, entry.createdAt);
  row.updatedAt = entry.updatedAt;
  return row;
}

/**
 * Writes backup entries over whatever shares their id, leaving every other row alone.
 *
 * Delete-then-insert rather than an upsert with explicit setters: the effect is the same and the
 * statement cannot silently miss a column added later.
 */
export async function restoreEntries(entries: CabinCrewLogEntry[]): Promise<void> {
  if (entries.length === 0) return;

  for (let start = 0; start < entries.length; start += RESTORE_CHUNK_SIZE) {
    const chunk = entries.slice(start, start + RESTORE_CHUNK_SIZE);
    await getDb()
      .delete(logEntries)
      .where(inArray(logEntries.id, chunk.map((entry) => entry.id)));
    await getDb().insert(logEntries).values(chunk.map(toRestoredRow));
  }

  bumpDataVersion();
}

/** The destructive restore: the backup becomes the whole logbook. Always confirmed by the caller. */
export async function replaceAllEntries(entries: CabinCrewLogEntry[]): Promise<void> {
  await getDb().delete(logEntries);

  for (let start = 0; start < entries.length; start += RESTORE_CHUNK_SIZE) {
    const chunk = entries.slice(start, start + RESTORE_CHUNK_SIZE);
    await getDb().insert(logEntries).values(chunk.map(toRestoredRow));
  }

  bumpDataVersion();
}
