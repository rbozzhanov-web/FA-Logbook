/**
 * The pay agreement the app computes against.
 *
 * Every figure here came from a crew member's own real payslip, and every one of them is a term
 * of a contract or of Kazakhstani tax law rather than a fact about flying — so all of it is
 * editable. Nothing in the calculation hard-codes a rate, a threshold, a multiplier or a
 * deduction figure.
 */

/**
 * One band of a tiered rate.
 *
 * `upTo` is the running total at which the tier stops — 60 means "the first 60 hours", 80 means
 * "up to the 80th hour". The last tier in a list carries no `upTo` and runs open-ended, which is
 * how anything past the top printed band is paid: a real payslip's own bands stop at some point,
 * and a month that goes further still has to be paid *something*.
 *
 * For the hour bands, `multiplier` is the *effective* rate for that whole band (1, 2, 2.5 — not
 * the extra 0/1/1.5 a payslip prints as a separate surcharge line): the payslip pays the first
 * 60 hours once and the 60–80 band a *second* time as a top-up, which nets out to the same total
 * as paying the 60–80 band at ×2 outright. Keeping the scheme in terms of the net effective rate
 * means an agreement's numbers ("60–80 is worth double") map straight onto this field; splitting
 * the base pay from its top-up is `calculatePay`'s job, done once, in one place.
 */
export interface PayTier {
  upTo?: number;
  multiplier: number;
}

/** Which of the app's night figures the pay calculation is fed. */
export type NightBasis = 'halfBlock' | 'contractual' | 'actual';

/** Whether positioning is paid by the hours flown or by the number of sectors. */
export type DeadheadBasis = 'hours' | 'sectors';

export interface PayScheme {
  /** The hourly rate everything else is a multiple of. */
  hourlyRate: number;

  /**
   * Full-month salary and travel allowance, before proration.
   *
   * Both are cut down to `(daysInMonth - unpaidAbsenceDays) / daysInMonth` of themselves when
   * `proratesFixedPayByAbsence` is on — a month with a week of sick leave pays a week less of
   * each. Set the flag off for an agreement that pays them in full regardless of attendance.
   */
  monthlySalary: number;
  monthlyTransport: number;
  proratesFixedPayByAbsence: boolean;

  /** Block-hour bands. Only operating hours reach these — positioning is paid separately. */
  hourTiers: PayTier[];
  /**
   * Sector bands. The first band's multiplier is zero: an agreement's first several sectors
   * commonly carry no sector payment at all, being covered by the hourly pay.
   */
  sectorTiers: PayTier[];

  nightMultiplier: number;
  nightBasis: NightBasis;

  deadheadMultiplier: number;
  deadheadBasis: DeadheadBasis;

  /**
   * Certified sick leave, paid per day rather than as a share of the month's flying — a crew
   * member on the ground the whole time doesn't fly, and doesn't get paid at the hourly rate for
   * it. Left at 0 until set: Kazakhstani practice bases the daily rate on average earnings over
   * the trailing 12 months, which this app has no way to reconstruct from the roster alone, so a
   * plausible-looking guess would be worse than an honest zero pending manual entry.
   */
  dailySickPayRate: number;

  osmsRate: number;
  opvRate: number;
  ipnRate: number;
  /**
   * The standard deduction subtracted before ИПН is applied — a legally set figure (currently
   * expressed in МРП) that changes with the yearly minimum-calculation-index update, so it is
   * kept as a plain number to re-enter rather than a formula this app would get stale.
   */
  ipnStandardDeduction: number;
}

/**
 * The scheme as a real Air Astana cabin-crew payslip has it.
 *
 * Reproduces that payslip's worked example to the tenge across every line — salary, hours,
 * night, sector and positioning pay, sick pay, and all three deductions — as pinned in
 * `__tests__/calculatePay.test.ts`.
 */
export const DEFAULT_PAY_SCHEME: PayScheme = {
  hourlyRate: 3100,

  monthlySalary: 164317,
  monthlyTransport: 78000,
  proratesFixedPayByAbsence: true,

  hourTiers: [
    { upTo: 60, multiplier: 1 },
    { upTo: 80, multiplier: 2 },
    { multiplier: 2.5 },
  ],

  sectorTiers: [
    { upTo: 15, multiplier: 0 },
    { upTo: 19, multiplier: 3 },
    { upTo: 24, multiplier: 4 },
    { upTo: 30, multiplier: 5 },
    { multiplier: 6 },
  ],

  nightMultiplier: 0.5,
  nightBasis: 'halfBlock',

  deadheadMultiplier: 0.5,
  deadheadBasis: 'hours',

  dailySickPayRate: 0,

  osmsRate: 0.02,
  opvRate: 0.1,
  ipnRate: 0.1,
  ipnStandardDeduction: 129750,
};

/** A tier's range in words, for labelling a payslip line. */
export function describeTier(tiers: PayTier[], index: number, unit: 'h' | 'sectors'): string {
  const from = index === 0 ? 0 : (tiers[index - 1].upTo ?? 0);
  const to = tiers[index].upTo;
  const suffix = unit === 'h' ? ' h' : '';

  if (index === 0) return `First ${to ?? '∞'}${suffix}`;
  if (to === undefined) return `Over ${from}${suffix}`;
  return `${from + 1}–${to}${suffix}`;
}

const SCHEME_VERSION = 2;

/**
 * Stored as JSON rather than as a dozen separate preference keys: the scheme is one agreement,
 * and half-updating it — a new rate against the old bands — would compute a number that matches
 * nothing.
 */
export function serializePayScheme(scheme: PayScheme): string {
  return JSON.stringify({ version: SCHEME_VERSION, ...scheme });
}

export function parsePayScheme(raw: string | undefined): PayScheme | undefined {
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  // An array passes a bare typeof check and would then spread harmlessly into the defaults,
  // yielding a complete scheme from a file that is plainly not one.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const value = parsed as Partial<PayScheme> & { version?: number };

  // Anything missing falls back to the default rather than to zero: a scheme that silently
  // computed with a rate of nothing would report a plausible-looking payslip of almost nothing.
  const scheme: PayScheme = {
    ...DEFAULT_PAY_SCHEME,
    ...value,
    hourTiers: validTiers(value.hourTiers) ?? DEFAULT_PAY_SCHEME.hourTiers,
    sectorTiers: validTiers(value.sectorTiers) ?? DEFAULT_PAY_SCHEME.sectorTiers,
  };

  const requiredNumbers: (keyof PayScheme)[] = [
    'hourlyRate',
    'monthlySalary',
    'monthlyTransport',
    'dailySickPayRate',
    'osmsRate',
    'opvRate',
    'ipnRate',
    'ipnStandardDeduction',
  ];
  if (requiredNumbers.some((key) => !isFiniteNumber(scheme[key]))) return undefined;

  return scheme;
}

function validTiers(tiers: unknown): PayTier[] | undefined {
  if (!Array.isArray(tiers) || tiers.length === 0) return undefined;

  const cleaned: PayTier[] = [];
  for (const tier of tiers) {
    if (typeof tier !== 'object' || tier === null) return undefined;
    const { upTo, multiplier } = tier as PayTier;
    if (!isFiniteNumber(multiplier)) return undefined;
    if (upTo !== undefined && !isFiniteNumber(upTo)) return undefined;
    cleaned.push(upTo === undefined ? { multiplier } : { upTo, multiplier });
  }

  // The last tier must be open-ended, or hours past the top band would silently go unpaid.
  const last = cleaned[cleaned.length - 1];
  if (last.upTo !== undefined) cleaned.push({ multiplier: last.multiplier });

  return cleaned;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
