/**
 * The pay agreement the app computes against.
 *
 * Every figure here came from a crew member's own pay spreadsheet, and every one of them is a
 * term of a contract rather than a fact about flying — so all of it is editable. Nothing in the
 * calculation hard-codes a rate, a threshold or a multiplier.
 */

/**
 * One band of a tiered rate.
 *
 * `upTo` is the running total at which the tier stops — 60 means "the first 60 hours", 80 means
 * "up to the 80th hour". The last tier in a list carries no `upTo` and runs open-ended, which is
 * how anything past the top printed band is paid: the source spreadsheet stops at 100 hours and
 * 38 sectors, and a month that goes further has to be paid *something*.
 */
export interface PayTier {
  upTo?: number;
  /** Multiplier applied to the base rate for each unit inside this tier. */
  multiplier: number;
}

/** Which of the app's two night figures the pay calculation is fed. */
export type NightBasis = 'contractual' | 'actual';

/** Whether positioning is paid by the hours flown or by the number of sectors. */
export type DeadheadBasis = 'hours' | 'sectors';

export interface PayScheme {
  /** The hourly rate everything else is a multiple of. */
  hourlyRate: number;
  /** Fixed monthly salary, paid regardless of hours. */
  baseSalary: number;
  /** Fixed monthly travel allowance. */
  perDiem: number;

  /** Block-hour bands. Only operating hours reach these — positioning is paid separately. */
  hourTiers: PayTier[];
  /**
   * Sector bands. The first band's multiplier is zero: the agreement's first fifteen sectors
   * carry no sector payment at all, they are covered by the hourly pay.
   */
  sectorTiers: PayTier[];

  nightMultiplier: number;
  nightBasis: NightBasis;

  deadheadMultiplier: number;
  deadheadBasis: DeadheadBasis;

  /**
   * Deductions, as fractions. They are not independent percentages of the gross — each is taken
   * from what the one before it left, which is why the order they appear in here is the order
   * they are applied in.
   */
  osmsRate: number;
  opvRate: number;
  ipnRate: number;
}

/**
 * The scheme as the source spreadsheet has it.
 *
 * Reproduces its worked example to the tenge (see `__tests__/calculatePay.test.ts`), with two
 * deliberate departures, both noted where they occur:
 *
 *  - the top hour and sector bands run open-ended rather than stopping at 100 hours and 38
 *    sectors, so a bigger month is still costed;
 *  - ОСМС is 2% of the gross. The sheet's own ОСМС cell reads 12000, but its ОПВ, ИПН and net
 *    figures are only reachable from 2% (16 495.51) — the three of them agree with each other
 *    and disagree with that one cell, so the cell is what gets treated as the mistake.
 */
export const DEFAULT_PAY_SCHEME: PayScheme = {
  hourlyRate: 3100,
  baseSalary: 12000,
  perDiem: 70000,

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
  nightBasis: 'contractual',

  deadheadMultiplier: 0.5,
  deadheadBasis: 'hours',

  osmsRate: 0.02,
  opvRate: 0.1,
  ipnRate: 0.1,
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

const SCHEME_VERSION = 1;

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

  return isFiniteNumber(scheme.hourlyRate) ? scheme : undefined;
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
