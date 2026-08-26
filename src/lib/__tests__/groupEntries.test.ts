import { CabinCrewLogEntry } from '@/src/types/logbook';
import { groupEntriesByMonth, isYearDivider } from '../groupEntries';

function entry(overrides: Partial<CabinCrewLogEntry>): CabinCrewLogEntry {
  return {
    id: overrides.id ?? overrides.date ?? 'x',
    date: '2026-07-14',
    kind: 'operating',
    departureAirport: 'ALA',
    arrivalAirport: 'NQZ',
    blockMinutes: 60,
    deadheadMinutes: 0,
    groundDutyMinutes: 0,
    dayMinutes: 60,
    nightMinutes: 0,
    source: 'manual',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('grouping the logbook by month', () => {
  it('keeps the order it was given rather than re-sorting', () => {
    // listEntries already returns date desc; re-sorting here would silently diverge from it.
    const sections = groupEntriesByMonth([
      entry({ id: '1', date: '2026-07-20' }),
      entry({ id: '2', date: '2026-07-02' }),
      entry({ id: '3', date: '2026-06-30' }),
    ]);

    expect(sections.map((s) => s.key)).toEqual(['2026-07', '2026-06']);
    expect(sections[0].data.map((row) => (isYearDivider(row) ? 'divider' : row.id))).toEqual(['1', '2']);
  });

  it('counts only operating sectors in a month header, but totals only their block time', () => {
    const sections = groupEntriesByMonth([
      entry({ id: '1', blockMinutes: 120 }),
      entry({ id: '2', kind: 'deadhead', blockMinutes: 0, deadheadMinutes: 90 }),
      entry({ id: '3', kind: 'ground', blockMinutes: 0, groundDutyMinutes: 540 }),
    ]);

    // All three are listed; only the first is a sector worked, and only its time is block time.
    expect(sections[0].data).toHaveLength(3);
    expect(sections[0].sectorCount).toBe(1);
    expect(sections[0].totalMinutes).toBe(120);
  });

  it('derives the month from the date string, never through a Date', () => {
    // A Date round trip would apply the device timezone and could shift an entry into the wrong
    // month — the last day of one and the first of the next are exactly where that shows up.
    const sections = groupEntriesByMonth([entry({ id: '1', date: '2026-07-01' })]);
    expect(sections[0].key).toBe('2026-07');
    expect(sections[0].monthLabel).toBe('July 2026');
  });

  it('introduces each year with a divider ahead of its first month', () => {
    const sections = groupEntriesByMonth([
      entry({ id: '1', date: '2026-01-05' }),
      entry({ id: '2', date: '2025-12-20' }),
    ]);

    // The newest year has no preceding month, so its divider is handed to the list as a header.
    expect(sections[0].leadingYearHeader?.year).toBe('2026');
    // The older year's divider is appended to the end of the newer month above it.
    const trailing = sections[0].data.at(-1)!;
    expect(isYearDivider(trailing) && trailing.yearHeader.year).toBe('2025');
  });

  it('totals a year across all its months', () => {
    const sections = groupEntriesByMonth([
      entry({ id: '1', date: '2026-07-14', blockMinutes: 60 }),
      entry({ id: '2', date: '2026-06-14', blockMinutes: 90 }),
    ]);

    expect(sections[0].leadingYearHeader).toMatchObject({ year: '2026', sectorCount: 2, totalMinutes: 150 });
  });
});
