import { CabinCrewLogEntry } from '@/src/types/logbook';
import { BACKUP_FORMAT_VERSION, mergeBackup, parseBackup, serializeBackup } from '../format';

function entry(overrides: Partial<CabinCrewLogEntry> = {}): CabinCrewLogEntry {
  return {
    id: 'a',
    date: '2026-07-14',
    kind: 'operating',
    flightNumber: '6410',
    departureAirport: 'ALA',
    arrivalAirport: 'NQZ',
    timeOut: '04:13',
    timeIn: '05:55',
    blockMinutes: 102,
    deadheadMinutes: 0,
    groundDutyMinutes: 0,
    dayMinutes: 57,
    nightMinutes: 45,
    position: 'FJ',
    source: 'pdf_import',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('the backup file', () => {
  it('round-trips a logbook without losing anything', () => {
    const entries = [entry(), entry({ id: 'b', kind: 'deadhead', blockMinutes: 0, deadheadMinutes: 90 })];
    const parsed = parseBackup(serializeBackup(entries));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.backup.entries).toEqual(entries);
  });

  it('records the night rule the totals were reported under', () => {
    // A night total is not interpretable without it, so the two travel together.
    const parsed = parseBackup(serializeBackup([entry()], { nightWindow: '22:00-06:00 station' }));
    expect(parsed.ok && parsed.backup.nightWindow).toBe('22:00-06:00 station');
  });

  it('fills in counters a file written before they existed does not carry', () => {
    const raw = JSON.stringify({
      app: 'fa-logbook',
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: '2026-07-14T00:00:00.000Z',
      entryCount: 1,
      entries: [
        {
          id: 'a',
          date: '2026-07-14',
          departureAirport: 'ALA',
          arrivalAirport: 'NQZ',
          createdAt: '2026-07-14T00:00:00.000Z',
          updatedAt: '2026-07-14T00:00:00.000Z',
        },
      ],
    });

    const parsed = parseBackup(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // `number + undefined` is NaN, which would poison every total in the app.
    expect(parsed.backup.entries[0].blockMinutes).toBe(0);
    expect(parsed.backup.entries[0].kind).toBe('operating');
  });

  it('says plainly when a file is not a backup at all', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'That file is not valid JSON.' });
    const wrongApp = parseBackup(JSON.stringify({ app: 'something-else' }));
    expect(wrongApp.ok).toBe(false);
  });

  it('refuses a file from a newer version rather than half-importing it', () => {
    const raw = JSON.stringify({
      app: 'fa-logbook',
      formatVersion: BACKUP_FORMAT_VERSION + 1,
      exportedAt: '2026-07-14T00:00:00.000Z',
      entryCount: 0,
      entries: [],
    });
    const parsed = parseBackup(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain('newer version');
  });
});

describe('merging a backup into what is already stored', () => {
  it('adds what is missing and leaves the rest alone', () => {
    const result = mergeBackup([entry()], [entry({ id: 'b' })]);
    expect(result.added).toBe(1);
    expect(result.merged).toHaveLength(2);
  });

  it('is a no-op when the same file is restored twice', () => {
    // Ids survive the round trip precisely so this cannot double a logbook.
    const result = mergeBackup([entry()], [entry()]);
    expect(result).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
    expect(result.merged).toHaveLength(1);
  });

  it('never deletes entries flown since the backup was taken', () => {
    const sinceBackup = entry({ id: 'flown-later', date: '2026-08-01' });
    const result = mergeBackup([entry(), sinceBackup], [entry()]);
    expect(result.merged).toContainEqual(sinceBackup);
  });

  it('takes the backup’s version of an entry that changed', () => {
    const result = mergeBackup([entry()], [entry({ remarks: 'edited' })]);
    expect(result.updated).toBe(1);
    expect(result.merged[0].remarks).toBe('edited');
  });
});
