import { MonthTotals } from '@/src/lib/monthlyTotals';
import { calculateMonthPay, calculatePay, splitAcrossTiers } from '../calculatePay';
import { DEFAULT_PAY_SCHEME, PayScheme, parsePayScheme, serializePayScheme } from '../payScheme';

/**
 * A real Air Astana cabin-crew payslip, entered exactly as its own cells read: July 2026,
 * 31 calendar days, 3 certified sick days and 1 day unfit to fly.
 *
 * This is the oracle for the whole module. Reproducing every one of its fifteen lines — salary,
 * every hour and sector band, night, positioning, sick pay, and all three deductions — to the
 * tenge proves both the tier split and, the part most easily got wrong, that ОСМС and ОПВ are
 * each a flat share of the gross while only ИПН is computed on what they and the standard
 * deduction leave.
 */
const PAYSLIP_SCHEME: PayScheme = {
  ...DEFAULT_PAY_SCHEME,
  dailySickPayRate: 24404.78,
};

const PAYSLIP_INPUTS = {
  blockHours: 95.43,
  nightHours: 95.43 / 2,
  sectorCount: 20,
  deadheadUnits: 1.72,
  deadheadBasis: 'hours' as const,
  daysInMonth: 31,
  sickDays: 3,
  unfitDays: 1,
};

describe('a real payslip', () => {
  const pay = calculatePay(PAYSLIP_INPUTS, PAYSLIP_SCHEME);

  it('prorates salary to whole tenge over days actually worked', () => {
    // 31 calendar days minus 3 sick and 1 unfit leaves 27 paid days.
    expect(pay.paidDays).toBe(27);
    expect(pay.salaryLine.amount).toBe(143115);
  });

  it('prorates the travel allowance the same way, kept to kopecks', () => {
    expect(pay.transportLine.amount).toBe(67935.48);
  });

  it('pays certified sick leave per day, at the configured daily rate', () => {
    expect(pay.sickLine.amount).toBe(73214.34);
  });

  it('pays every hour once at the base rate, then tops up the higher bands only', () => {
    expect(pay.hourBaseLine.amount).toBe(295833); // 95.43 h at the base rate
    expect(pay.hourSurchargeLines[0].amount).toBe(62000); // 20 h in 60–80, top-up only
    expect(pay.hourSurchargeLines[1].amount).toBe(71750); // 15.43 h over 80, top-up only
    expect(pay.hourPay).toBe(429583);
  });

  it('pays night as half the block hours, at half the rate', () => {
    expect(pay.nightLine.amount).toBe(73958);
  });

  it('pays the sector bands, the first several free', () => {
    expect(pay.sectorLines.map((line) => line.amount)).toEqual([0, 37200, 12400, 0, 0]);
    expect(pay.sectorPay).toBe(49600);
  });

  it('pays positioning apart from the hour bands', () => {
    expect(pay.deadheadLine.amount).toBe(2666);
  });

  it('reaches the payslip’s gross of 840 071.82', () => {
    expect(pay.gross).toBe(840071.82);
  });

  it('takes ОСМС and ОПВ each as a flat share of the gross, not cascaded', () => {
    // (gross − ОСМС) × 10% would give 82 327.04, not the payslip's 84 007.18 — the failure this
    // guards against.
    expect(pay.osms).toBe(16801);
    expect(pay.opv).toBe(84007.18);
  });

  it('computes ИПН on what ОСМС, ОПВ and the standard deduction leave', () => {
    expect(pay.ipn).toBe(60951);
  });

  it('reaches the payslip’s total deductions of 161 759.18 and net of 678 312.64', () => {
    expect(pay.totalDeductions).toBe(161759.18);
    expect(pay.net).toBe(678312.64);
  });

  it('has every line adding up to the total printed beneath it', () => {
    const lineSum =
      pay.salaryLine.amount +
      pay.transportLine.amount +
      pay.sickLine.amount +
      pay.hourPay +
      pay.nightLine.amount +
      pay.sectorPay +
      pay.deadheadLine.amount;
    expect(lineSum).toBe(pay.gross);
    expect(Math.round((pay.net + pay.totalDeductions) * 100) / 100).toBe(pay.gross);
  });
});

describe('an agreement that pays the fixed amounts in full regardless of attendance', () => {
  it('stops prorating when the flag is off', () => {
    const scheme: PayScheme = { ...PAYSLIP_SCHEME, proratesFixedPayByAbsence: false };
    const pay = calculatePay(PAYSLIP_INPUTS, scheme);
    expect(pay.salaryLine.amount).toBe(scheme.monthlySalary);
    expect(pay.transportLine.amount).toBe(scheme.monthlyTransport);
  });
});

describe('splitting a quantity across tiers', () => {
  it('fills each band before the next takes anything', () => {
    const [first, second, third] = splitAcrossTiers(95.43, DEFAULT_PAY_SCHEME.hourTiers);
    expect(first).toBe(60);
    expect(second).toBe(20);
    expect(third).toBeCloseTo(15.43, 9);
  });

  it('puts everything past the top band into it, rather than dropping it', () => {
    const [, , top] = splitAcrossTiers(140, DEFAULT_PAY_SCHEME.hourTiers);
    expect(top).toBe(60);
  });

  it('always sums back to what it split', () => {
    for (const quantity of [0, 0.5, 60, 60.01, 80, 99.99, 250]) {
      const parts = splitAcrossTiers(quantity, DEFAULT_PAY_SCHEME.hourTiers);
      expect(parts.reduce((sum, part) => sum + part, 0)).toBeCloseTo(quantity, 9);
    }
  });

  it('handles nothing flown at all', () => {
    expect(splitAcrossTiers(0, DEFAULT_PAY_SCHEME.sectorTiers)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('a month without flying', () => {
  it('still pays the prorated salary and allowance', () => {
    const pay = calculatePay(
      {
        blockHours: 0,
        nightHours: 0,
        sectorCount: 0,
        deadheadUnits: 0,
        deadheadBasis: 'hours',
        daysInMonth: 30,
        sickDays: 0,
        unfitDays: 0,
      },
      DEFAULT_PAY_SCHEME,
    );

    expect(pay.paidDays).toBe(30);
    expect(pay.gross).toBe(DEFAULT_PAY_SCHEME.monthlySalary + DEFAULT_PAY_SCHEME.monthlyTransport);
    expect(pay.net).toBeGreaterThan(0);
    expect(pay.net).toBeLessThan(pay.gross);
  });

  it('never lets sick and unfit days push paid days below zero', () => {
    const pay = calculatePay(
      {
        blockHours: 0,
        nightHours: 0,
        sectorCount: 0,
        deadheadUnits: 0,
        deadheadBasis: 'hours',
        daysInMonth: 28,
        sickDays: 20,
        unfitDays: 20,
      },
      DEFAULT_PAY_SCHEME,
    );
    expect(pay.paidDays).toBe(0);
    expect(pay.salaryLine.amount).toBe(0);
  });
});

function month(overrides: Partial<MonthTotals> = {}): MonthTotals {
  return {
    key: '2026-07',
    label: 'July 2026',
    sectorCount: 0,
    deadheadCount: 0,
    blockMinutes: 0,
    // Mirrors blockMinutes by default so tests that don't care about the norm/actual distinction
    // don't have to set both; tests that do care override normBlockMinutes explicitly.
    normBlockMinutes: overrides.blockMinutes ?? 0,
    bands: { baseMinutes: 0, midMinutes: 0, highMinutes: 0 },
    band: 'under',
    deadheadMinutes: 0,
    groundDutyMinutes: 0,
    dutyMinutes: 0,
    nightMinutes: 0,
    windowNightMinutes: 0,
    sickDays: 0,
    unfitDays: 0,
    ...overrides,
  };
}

describe('feeding a month of the logbook into the scheme', () => {
  it('converts stored minutes to true decimal hours before rounding to 2dp', () => {
    // 95:26 is 95.4333… hours, which rounds to 95.43 — not the 95.26 a roster label invites.
    const pay = calculateMonthPay(month({ blockMinutes: 95 * 60 + 26 }), DEFAULT_PAY_SCHEME);
    expect(pay.hourBaseLine.units).toBeCloseTo(95.43, 2);
  });

  it('derives the calendar days in the month from its key, leap years included', () => {
    const july = calculateMonthPay(month({ key: '2026-07' }), DEFAULT_PAY_SCHEME);
    const feb2028 = calculateMonthPay(month({ key: '2028-02' }), DEFAULT_PAY_SCHEME); // leap
    const feb2026 = calculateMonthPay(month({ key: '2026-02' }), DEFAULT_PAY_SCHEME); // not leap
    expect(july.inputs.daysInMonth).toBe(31);
    expect(feb2028.inputs.daysInMonth).toBe(29);
    expect(feb2026.inputs.daysInMonth).toBe(28);
  });

  it('reads night as exactly half the same rounded block hours used for the hour lines by default', () => {
    const pay = calculateMonthPay(
      month({ blockMinutes: 95 * 60 + 26, nightMinutes: 34 * 60, windowNightMinutes: 35 * 60 }),
      DEFAULT_PAY_SCHEME,
    );
    expect(pay.inputs.nightHours).toBeCloseTo(95.43 / 2, 4);
  });

  it('can be switched to the contractual or the astronomical night figure instead', () => {
    const contractual = calculateMonthPay(
      month({ nightMinutes: 34 * 60 + 28, windowNightMinutes: 35 * 60 + 11 }),
      { ...DEFAULT_PAY_SCHEME, nightBasis: 'contractual' },
    );
    expect(contractual.inputs.nightHours).toBeCloseTo(35.1833, 4);

    const actual = calculateMonthPay(
      month({ nightMinutes: 34 * 60 + 28, windowNightMinutes: 35 * 60 + 11 }),
      { ...DEFAULT_PAY_SCHEME, nightBasis: 'actual' },
    );
    expect(actual.inputs.nightHours).toBeCloseTo(34.4667, 4);
  });

  it('defaults to the published CrewPay norm hours, falling back to the scheme’s "actual" setting', () => {
    const fixture = month({ blockMinutes: 80 * 60, normBlockMinutes: 95 * 60 });

    const norm = calculateMonthPay(fixture, DEFAULT_PAY_SCHEME);
    expect(norm.inputs.blockHours).toBe(95);

    const actual = calculateMonthPay(fixture, { ...DEFAULT_PAY_SCHEME, blockHoursBasis: 'actual' });
    expect(actual.inputs.blockHours).toBe(80);
  });

  it('pays deadhead by sectors when the scheme says so', () => {
    const scheme: PayScheme = { ...DEFAULT_PAY_SCHEME, deadheadBasis: 'sectors' };
    const pay = calculateMonthPay(month({ deadheadCount: 3, deadheadMinutes: 300 }), scheme);
    expect(pay.inputs.deadheadUnits).toBe(3);
    expect(pay.deadheadLine.amount).toBe(4650);
  });

  it('never lets positioning reach the sector bands', () => {
    const pay = calculateMonthPay(month({ sectorCount: 15, deadheadCount: 5 }), DEFAULT_PAY_SCHEME);
    expect(pay.sectorPay).toBe(0);
  });

  it('carries the month’s own sick and unfit days into the paid-days count', () => {
    const pay = calculateMonthPay(month({ sickDays: 3, unfitDays: 1 }), DEFAULT_PAY_SCHEME);
    expect(pay.paidDays).toBe(31 - 4);
  });
});

describe('storing the scheme', () => {
  it('round-trips', () => {
    const scheme: PayScheme = { ...DEFAULT_PAY_SCHEME, hourlyRate: 3500, monthlyTransport: 82000 };
    expect(parsePayScheme(serializePayScheme(scheme))).toMatchObject(scheme);
  });

  it('falls back rather than computing with a broken scheme', () => {
    for (const raw of [undefined, '', 'not json', '[]', '{"hourlyRate":"lots"}']) {
      expect(parsePayScheme(raw)).toBeUndefined();
    }
  });

  it('fills in anything a stored scheme is missing', () => {
    const partial = parsePayScheme(JSON.stringify({ hourlyRate: 4000 }))!;
    expect(partial.hourlyRate).toBe(4000);
    expect(partial.hourTiers).toEqual(DEFAULT_PAY_SCHEME.hourTiers);
    expect(partial.ipnStandardDeduction).toBe(DEFAULT_PAY_SCHEME.ipnStandardDeduction);
  });

  it('reopens a stored top band that was closed, so big months stay paid', () => {
    const closed = parsePayScheme(
      JSON.stringify({ hourlyRate: 3100, hourTiers: [{ upTo: 60, multiplier: 1 }] }),
    )!;
    expect(closed.hourTiers[closed.hourTiers.length - 1].upTo).toBeUndefined();
  });
});
