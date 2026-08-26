import { DEFAULT_NIGHT_WINDOW } from '@/src/lib/daynight/nightWindow';
import { CabinCrewLogEntry } from '@/src/types/logbook';
import {
  BAND_LOWER_HOURS,
  BAND_UPPER_HOURS,
  bandReached,
  bandTotals,
  monthlyTotals,
  splitIntoBands,
} from '../monthlyTotals';

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
    source: 'pdf_import',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

/** A month of exactly `hours` block time, spread over two sectors so it is not a single row. */
function monthOf(month: string, hours: number, extra: Partial<CabinCrewLogEntry> = {}) {
  const minutes = Math.round(hours * 60);
  return [
    entry({ date: `${month}-05`, blockMinutes: Math.floor(minutes / 2), ...extra }),
    entry({ date: `${month}-20`, blockMinutes: minutes - Math.floor(minutes / 2), ...extra }),
  ];
}

describe('splitting a month across the bands', () => {
  it('puts a short month entirely in the base band', () => {
    expect(splitIntoBands(40 * 60)).toEqual({
      baseMinutes: 40 * 60,
      midMinutes: 0,
      highMinutes: 0,
    });
  });

  it('fills the base band before the middle one', () => {
    expect(splitIntoBands(70 * 60)).toEqual({
      baseMinutes: BAND_LOWER_HOURS * 60,
      midMinutes: 10 * 60,
      highMinutes: 0,
    });
  });

  it('caps the middle band and carries the rest above the upper threshold', () => {
    // 91:53 — the sample roster's own month.
    const split = splitIntoBands(91 * 60 + 53);
    expect(split.baseMinutes).toBe(60 * 60);
    expect(split.midMinutes).toBe(20 * 60);
    expect(split.highMinutes).toBe(11 * 60 + 53);
  });

  it('always sums back to the month it split', () => {
    // The property that makes the table trustworthy: no minute is lost or double-counted.
    for (const minutes of [0, 1, 59 * 60 + 59, 60 * 60, 80 * 60, 80 * 60 + 1, 200 * 60]) {
      const { baseMinutes, midMinutes, highMinutes } = splitIntoBands(minutes);
      expect(baseMinutes + midMinutes + highMinutes).toBe(minutes);
    }
  });

  it('treats a negative total as nothing rather than propagating it', () => {
    expect(splitIntoBands(-10)).toEqual({ baseMinutes: 0, midMinutes: 0, highMinutes: 0 });
  });
});

describe('which band a month reached', () => {
  it('is exact at the thresholds', () => {
    expect(bandReached(BAND_LOWER_HOURS * 60 - 1)).toBe('under');
    expect(bandReached(BAND_LOWER_HOURS * 60)).toBe('mid');
    expect(bandReached(BAND_UPPER_HOURS * 60)).toBe('mid');
    expect(bandReached(BAND_UPPER_HOURS * 60 + 1)).toBe('high');
  });
});

describe('the monthly breakdown', () => {
  it('groups by calendar month, newest first', () => {
    const months = monthlyTotals([
      ...monthOf('2026-06', 50),
      ...monthOf('2026-07', 70),
      ...monthOf('2026-08', 90),
    ]);

    expect(months.map((m) => m.key)).toEqual(['2026-08', '2026-07', '2026-06']);
    expect(months[0].label).toBe('August 2026');
  });

  it('bands each month on its own total, never on the career total', () => {
    // Three 30-hour months are three under-band months, not one 90-hour month.
    const months = monthlyTotals([
      ...monthOf('2026-06', 30),
      ...monthOf('2026-07', 30),
      ...monthOf('2026-08', 30),
    ]);

    expect(months.every((m) => m.band === 'under')).toBe(true);
    expect(bandTotals(months)).toMatchObject({ midMinutes: 0, highMinutes: 0 });
  });

  it('adds the band portions up across months', () => {
    const months = monthlyTotals([
      ...monthOf('2026-06', 70), // 10h in the middle band
      ...monthOf('2026-07', 90), // 20h middle, 10h high
      ...monthOf('2026-08', 50), // nothing above the base
    ]);

    const totals = bandTotals(months);
    expect(totals.midMinutes).toBe(30 * 60);
    expect(totals.highMinutes).toBe(10 * 60);
    expect(totals.monthsInMid).toBe(1);
    expect(totals.monthsInHigh).toBe(1);
  });

  it('counts sectors but not deadhead or ground duty toward block hours', () => {
    const months = monthlyTotals([
      entry({ date: '2026-07-05', blockMinutes: 120 }),
      entry({ date: '2026-07-06', kind: 'deadhead', deadheadMinutes: 90 }),
      entry({ date: '2026-07-07', kind: 'ground', groundDutyMinutes: 540, dutyCode: 'HYGT' }),
    ]);

    expect(months[0]).toMatchObject({
      sectorCount: 1,
      blockMinutes: 120,
      deadheadCount: 1,
      deadheadMinutes: 90,
      groundDutyMinutes: 540,
    });
  });

  it('counts sick days per month and keeps unfit-to-fly separate', () => {
    const months = monthlyTotals([
      ...monthOf('2026-07', 40),
      entry({ date: '2026-07-20', kind: 'absence', dutyCode: 'SICK' }),
      entry({ date: '2026-07-21', kind: 'absence', dutyCode: 'SICK' }),
      entry({ date: '2026-07-22', kind: 'absence', dutyCode: 'UFF' }),
      entry({ date: '2026-08-01', kind: 'absence', dutyCode: 'SICK' }),
    ]);

    const july = months.find((m) => m.key === '2026-07')!;
    expect(july.sickDays).toBe(2);
    expect(july.unfitDays).toBe(1);

    const totals = bandTotals(months);
    expect(totals.sickDays).toBe(3);
    expect(totals.unfitDays).toBe(1);
    expect(totals.monthsWithSickLeave).toBe(2);
  });

  it('never lets an absence contribute hours to its month', () => {
    const months = monthlyTotals([
      entry({ date: '2026-07-20', kind: 'absence', dutyCode: 'SICK' }),
    ]);

    expect(months[0]).toMatchObject({ blockMinutes: 0, sectorCount: 0, sickDays: 1 });
    expect(months[0].band).toBe('under');
  });

  it('counts duty hours once per duty within the month', () => {
    const months = monthlyTotals([
      entry({
        date: '2026-07-14',
        blockMinutes: 60,
        dutyStart: '2026-07-14T06:00',
        dutyEnd: '2026-07-14T18:00',
        dutySectorIndex: 1,
        dutySectorCount: 2,
      }),
      entry({
        date: '2026-07-14',
        blockMinutes: 60,
        dutyStart: '2026-07-14T06:00',
        dutyEnd: '2026-07-14T18:00',
        dutySectorIndex: 2,
        dutySectorCount: 2,
      }),
    ]);

    expect(months[0].dutyMinutes).toBe(12 * 60);
  });

  it('derives the month from the date string, never through a Date', () => {
    // A Date round trip would apply the device timezone and could move a sector flown on the
    // 1st or the 31st into a neighbouring month — precisely where a band threshold is decided.
    const months = monthlyTotals([
      entry({ date: '2026-07-01', blockMinutes: 60 }),
      entry({ date: '2026-07-31', blockMinutes: 60 }),
    ]);

    expect(months).toHaveLength(1);
    expect(months[0].key).toBe('2026-07');
  });

  it('counts a listed route at its published CrewPay Norm time when the date is in season', () => {
    // ALA-NQZ is 1:55 (115 min) in the published table, effective 2025-10-01–2026-03-31.
    const months = monthlyTotals([
      entry({ date: '2025-12-01', departureAirport: 'ALA', arrivalAirport: 'NQZ', blockMinutes: 100 }),
    ]);

    expect(months[0].blockMinutes).toBe(100);
    expect(months[0].normBlockMinutes).toBe(115);
  });

  it('falls back to actual time for a route the norm table does not list', () => {
    const months = monthlyTotals([
      entry({ date: '2025-12-01', departureAirport: 'ZZZ', arrivalAirport: 'ZZZ', blockMinutes: 100 }),
    ]);

    expect(months[0].normBlockMinutes).toBe(100);
  });

  it('falls back to actual time for a listed route outside the table’s effective dates', () => {
    // Same ALA-NQZ pair as above, but flown after the table's 2026-03-31 cutoff.
    const months = monthlyTotals([
      entry({ date: '2026-07-14', departureAirport: 'ALA', arrivalAirport: 'NQZ', blockMinutes: 100 }),
    ]);

    expect(months[0].normBlockMinutes).toBe(100);
  });

  it('never lets the norm figure affect the bands, which stay on actual time', () => {
    const months = monthlyTotals([
      entry({ date: '2025-12-01', departureAirport: 'ALA', arrivalAirport: 'NQZ', blockMinutes: 100 }),
    ]);

    expect(months[0].band).toBe('under');
    expect(months[0].bands.baseMinutes).toBe(100);
  });

  it('recomputes the contractual night figure per month when a window is given', () => {
    const months = monthlyTotals(
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

    expect(months[0].nightMinutes).toBe(190);
    expect(months[0].windowNightMinutes).toBe(105);
  });
});
