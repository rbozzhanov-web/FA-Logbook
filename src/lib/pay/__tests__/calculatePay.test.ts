import { MonthTotals } from '@/src/lib/monthlyTotals';
import { calculateMonthPay, calculatePay, splitAcrossTiers } from '../calculatePay';
import { DEFAULT_PAY_SCHEME, PayScheme, parsePayScheme, serializePayScheme } from '../payScheme';

/**
 * The worked example from the crew pay spreadsheet, entered exactly as its own cells read.
 *
 * This is the oracle for the whole module. Reproducing it to the tenge proves the tier split,
 * the multipliers, the separate deadhead rule and — the part most easily got wrong — that the
 * three deductions cascade rather than each taking a percentage of the gross.
 */
const SHEET_EXAMPLE = {
  blockHours: 98.22,
  nightHours: 49.11,
  sectorCount: 31,
  deadheadUnits: 3,
  deadheadBasis: 'hours' as const,
};

describe('the pay spreadsheet’s worked example', () => {
  const pay = calculatePay(SHEET_EXAMPLE, DEFAULT_PAY_SCHEME);

  it('splits the hours 60 / 20 / 18.22 across the bands', () => {
    expect(pay.hourLines.map((line) => line.units)).toEqual([60, 20, 18.22]);
    expect(pay.hourLines.map((line) => line.multiplier)).toEqual([1, 2, 2.5]);
    expect(pay.hourLines.map((line) => line.amount)).toEqual([186000, 124000, 141205]);
  });

  it('pays 451 205 for the hours', () => {
    expect(pay.hourPay).toBe(451205);
  });

  it('pays 76 120.5 for the night', () => {
    expect(pay.nightLine.amount).toBe(76120.5);
  });

  it('splits 31 sectors 15 / 4 / 5 / 6 / 1 and pays the first fifteen nothing', () => {
    expect(pay.sectorLines.map((line) => line.units)).toEqual([15, 4, 5, 6, 1]);
    expect(pay.sectorLines[0].amount).toBe(0);
    expect(pay.sectorLines.map((line) => line.amount)).toEqual([0, 37200, 62000, 93000, 18600]);
    expect(pay.sectorPay).toBe(210800);
  });

  it('pays deadhead at half rate, apart from the hour bands', () => {
    expect(pay.deadheadLine.amount).toBe(4650);
  });

  it('reaches the sheet’s gross of 824 775.5', () => {
    expect(pay.gross).toBe(824775.5);
  });

  it('cascades the three deductions rather than taking each off the gross', () => {
    // Flat percentages of the gross would give 16 495.51 / 82 477.55 / 82 477.55 and a net some
    // 11 000 short — the failure this whole test exists to catch.
    expect(pay.osms).toBe(16495.51);
    expect(pay.opv).toBe(80828);
    expect(pay.ipn).toBe(72745.2);
  });

  it('reaches the sheet’s net of 654 707', () => {
    expect(Math.round(pay.net)).toBe(654707);
  });

  it('has lines that add up to the total they are printed under', () => {
    const lineSum =
      pay.hourPay +
      pay.nightLine.amount +
      pay.sectorPay +
      pay.deadheadLine.amount +
      pay.baseSalary +
      pay.perDiem;
    expect(lineSum).toBe(pay.gross);
    expect(pay.net + pay.totalDeductions).toBe(pay.gross);
  });
});

describe('splitting a quantity across tiers', () => {
  it('fills each band before the next takes anything', () => {
    const [first, second, third] = splitAcrossTiers(98.22, DEFAULT_PAY_SCHEME.hourTiers);
    expect(first).toBe(60);
    expect(second).toBe(20);
    expect(third).toBeCloseTo(18.22, 9);
  });

  it('leaves later bands empty when the quantity does not reach them', () => {
    expect(splitAcrossTiers(45, DEFAULT_PAY_SCHEME.hourTiers)).toEqual([45, 0, 0]);
  });

  it('puts everything past the top band into it, rather than dropping it', () => {
    // The sheet's printed bands stop at 100 hours; a bigger month still has to be paid.
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
  it('still pays the fixed salary and allowance', () => {
    const pay = calculatePay(
      { blockHours: 0, nightHours: 0, sectorCount: 0, deadheadUnits: 0, deadheadBasis: 'hours' },
      DEFAULT_PAY_SCHEME,
    );

    expect(pay.gross).toBe(DEFAULT_PAY_SCHEME.baseSalary + DEFAULT_PAY_SCHEME.perDiem);
    expect(pay.net).toBeGreaterThan(0);
    expect(pay.net).toBeLessThan(pay.gross);
  });
});

function month(overrides: Partial<MonthTotals> = {}): MonthTotals {
  return {
    key: '2026-07',
    label: 'July 2026',
    sectorCount: 0,
    deadheadCount: 0,
    blockMinutes: 0,
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
  it('converts stored minutes to true decimal hours', () => {
    // 91:53 is 91.883 hours. Typing "91,53" into a decimal cell — the usual shortcut — would
    // lose 21 minutes of pay, so the conversion is done from minutes rather than from the label.
    const pay = calculateMonthPay(month({ blockMinutes: 91 * 60 + 53 }), DEFAULT_PAY_SCHEME);
    expect(pay.inputs.blockHours).toBeCloseTo(91.8833, 4);
  });

  it('pays on the contractual night figure by default', () => {
    const pay = calculateMonthPay(
      month({ nightMinutes: 34 * 60 + 28, windowNightMinutes: 35 * 60 + 11 }),
      DEFAULT_PAY_SCHEME,
    );
    expect(pay.inputs.nightHours).toBeCloseTo(35.1833, 4);
  });

  it('can be switched to the astronomical night figure instead', () => {
    const scheme: PayScheme = { ...DEFAULT_PAY_SCHEME, nightBasis: 'actual' };
    const pay = calculateMonthPay(
      month({ nightMinutes: 34 * 60 + 28, windowNightMinutes: 35 * 60 + 11 }),
      scheme,
    );
    expect(pay.inputs.nightHours).toBeCloseTo(34.4667, 4);
  });

  it('pays deadhead by sectors when the scheme says so', () => {
    const scheme: PayScheme = { ...DEFAULT_PAY_SCHEME, deadheadBasis: 'sectors' };
    const pay = calculateMonthPay(month({ deadheadCount: 3, deadheadMinutes: 300 }), scheme);
    expect(pay.inputs.deadheadUnits).toBe(3);
    expect(pay.deadheadLine.amount).toBe(4650);
  });

  it('never lets positioning reach the sector bands', () => {
    // Deadhead is paid on its own line; counting it as a sector too would pay it twice.
    const pay = calculateMonthPay(month({ sectorCount: 15, deadheadCount: 5 }), DEFAULT_PAY_SCHEME);
    expect(pay.sectorPay).toBe(0);
  });
});

describe('storing the scheme', () => {
  it('round-trips', () => {
    const scheme: PayScheme = { ...DEFAULT_PAY_SCHEME, hourlyRate: 3500, perDiem: 82000 };
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
    expect(partial.osmsRate).toBe(DEFAULT_PAY_SCHEME.osmsRate);
  });

  it('reopens a stored top band that was closed, so big months stay paid', () => {
    const closed = parsePayScheme(
      JSON.stringify({ hourlyRate: 3100, hourTiers: [{ upTo: 60, multiplier: 1 }] }),
    )!;
    expect(closed.hourTiers[closed.hourTiers.length - 1].upTo).toBeUndefined();
  });
});
