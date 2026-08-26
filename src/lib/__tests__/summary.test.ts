import { DEFAULT_NIGHT_WINDOW } from '@/src/lib/daynight/nightWindow';
import { CabinCrewLogEntry } from '@/src/types/logbook';
import { entryDutyMinutes, isFirstSectorOfDuty, summarise } from '../summary';

function entry(overrides: Partial<CabinCrewLogEntry>): CabinCrewLogEntry {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    date: '2026-07-14',
    kind: 'operating',
    departureAirport: 'ALA',
    arrivalAirport: 'NQZ',
    blockMinutes: 0,
    deadheadMinutes: 0,
    groundDutyMinutes: 0,
    dayMinutes: 0,
    nightMinutes: 0,
    source: 'manual',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

/** A three-sector day: one duty, reported once, flown three times. */
const THREE_SECTOR_DUTY = [
  entry({
    flightNumber: '1',
    blockMinutes: 60,
    dayMinutes: 60,
    dutyStart: '2026-07-14T06:00',
    dutyEnd: '2026-07-14T18:00',
    dutySectorIndex: 1,
    dutySectorCount: 3,
  }),
  entry({
    flightNumber: '2',
    blockMinutes: 90,
    dayMinutes: 90,
    dutyStart: '2026-07-14T06:00',
    dutyEnd: '2026-07-14T18:00',
    dutySectorIndex: 2,
    dutySectorCount: 3,
  }),
  entry({
    flightNumber: '3',
    blockMinutes: 30,
    dayMinutes: 30,
    dutyStart: '2026-07-14T06:00',
    dutyEnd: '2026-07-14T18:00',
    dutySectorIndex: 3,
    dutySectorCount: 3,
  }),
];

describe('totals', () => {
  it('counts duty hours once per duty, not once per sector', () => {
    // The failure this guards against would report a twelve-hour day as thirty-six hours.
    const totals = summarise(THREE_SECTOR_DUTY);
    expect(totals.dutyMinutes).toBe(12 * 60);
    expect(totals.dutyCount).toBe(1);
    expect(totals.sectorCount).toBe(3);
    expect(totals.blockMinutes).toBe(180);
  });

  it('keeps deadhead time out of block hours but reports it', () => {
    const totals = summarise([
      entry({ blockMinutes: 120, dayMinutes: 120 }),
      entry({ kind: 'deadhead', deadheadMinutes: 100, dayMinutes: 100 }),
    ]);

    expect(totals.blockMinutes).toBe(120);
    expect(totals.deadheadMinutes).toBe(100);
    expect(totals.airborneMinutes).toBe(220);
    expect(totals.sectorCount).toBe(1);
    expect(totals.deadheadCount).toBe(1);
  });

  it('keeps ground duty out of every flying figure', () => {
    const totals = summarise([
      entry({ kind: 'ground', groundDutyMinutes: 540, dutyCode: 'HYGT' }),
    ]);

    expect(totals.groundDutyMinutes).toBe(540);
    expect(totals.blockMinutes).toBe(0);
    expect(totals.airborneMinutes).toBe(0);
    expect(totals.sectorCount).toBe(0);
    expect(totals.nightMinutes).toBe(0);
  });

  it('reports night with and without deadhead', () => {
    const totals = summarise([
      entry({ blockMinutes: 120, nightMinutes: 60, dayMinutes: 60 }),
      entry({ kind: 'deadhead', deadheadMinutes: 100, nightMinutes: 100 }),
    ]);

    expect(totals.nightMinutes).toBe(60);
    expect(totals.nightMinutesInclDeadhead).toBe(160);
  });

  it('counts an entry with no duty information as its own duty rather than dropping it', () => {
    // A hand-typed entry must not be silently missing from the duty total.
    const totals = summarise([
      entry({ blockMinutes: 60, dutyStart: '2026-07-14T06:00', dutyEnd: '2026-07-14T10:00' }),
    ]);

    expect(totals.dutyCount).toBe(1);
    expect(totals.dutyMinutes).toBe(4 * 60);
  });

  it('skips a duty the roster left open rather than counting it as zero', () => {
    const totals = summarise([entry({ blockMinutes: 60, dutyStart: '2026-07-14T06:00' })]);
    expect(totals.dutyCount).toBe(0);
    expect(totals.dutyMinutes).toBe(0);
  });

  it('counts sectors that carried any night time', () => {
    const totals = summarise([
      entry({ blockMinutes: 60, nightMinutes: 10, dayMinutes: 50 }),
      entry({ blockMinutes: 60, dayMinutes: 60 }),
    ]);
    expect(totals.nightSectorCount).toBe(1);
  });

  it('recomputes the contractual night figure from the sector’s own times', () => {
    // Stored night minutes are the astronomical figure; the window figure is derived, so a
    // change of rule re-reports the whole logbook rather than only new imports.
    const totals = summarise(
      [
        entry({
          date: '2026-07-12',
          departureAirport: 'ALA',
          arrivalAirport: 'SCO',
          timeOut: '20:35',
          timeIn: '23:45',
          blockMinutes: 190,
          nightMinutes: 190,
        }),
      ],
      DEFAULT_NIGHT_WINDOW,
    );

    expect(totals.nightMinutes).toBe(190);
    expect(totals.windowNightMinutes).toBe(105);
  });
});

describe('duty helpers', () => {
  it('measures a duty that runs past midnight', () => {
    expect(
      entryDutyMinutes(entry({ dutyStart: '2026-07-08T19:00', dutyEnd: '2026-07-09T04:22' })),
    ).toBe(9 * 60 + 22);
  });

  it('refuses a duty that appears to end before it started', () => {
    expect(
      entryDutyMinutes(entry({ dutyStart: '2026-07-09T04:22', dutyEnd: '2026-07-08T19:00' })),
    ).toBeUndefined();
  });

  it('treats an entry with no sector numbering as the first of its duty', () => {
    expect(isFirstSectorOfDuty(entry({}))).toBe(true);
    expect(isFirstSectorOfDuty(entry({ dutySectorIndex: 1 }))).toBe(true);
    expect(isFirstSectorOfDuty(entry({ dutySectorIndex: 2 }))).toBe(false);
  });
});
