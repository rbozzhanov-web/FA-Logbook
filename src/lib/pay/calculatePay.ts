import { MonthTotals } from '@/src/lib/monthlyTotals';
import { DeadheadBasis, PayScheme, PayTier, describeTier } from './payScheme';

/**
 * A month's pay, worked out from the logbook.
 *
 * Laid out to mirror a payslip line for line, because that is what it will be checked against:
 * every figure carries the units and the multiplier it came from, so a disagreement can be
 * traced to a line rather than to "the app says something else".
 */

export interface PayLine {
  label: string;
  /** Hours (decimal) or sectors — whichever this line is paid on. */
  units: number;
  multiplier: number;
  amount: number;
}

export interface PayInputs {
  /** Operating block time, in decimal hours. */
  blockHours: number;
  /** The night figure the scheme pays on, in decimal hours. */
  nightHours: number;
  /** Operating sectors. Positioning is paid separately and never reaches the sector bands. */
  sectorCount: number;
  /** Positioning, in whichever unit the scheme pays it by. */
  deadheadUnits: number;
  deadheadBasis: DeadheadBasis;
}

export interface PayCalculation {
  inputs: PayInputs;

  hourLines: PayLine[];
  hourPay: number;

  nightLine: PayLine;

  sectorLines: PayLine[];
  sectorPay: number;

  deadheadLine: PayLine;

  baseSalary: number;
  perDiem: number;
  gross: number;

  osms: number;
  opv: number;
  ipn: number;
  totalDeductions: number;
  net: number;
}

/**
 * Money is rounded to whole tenge at each line.
 *
 * Not cosmetic: 18.22 × 3100 × 2.5 lands on 141205.00000000003 in binary floating point, and a
 * payslip that reports that instead of 141205 invites the reader to distrust every other figure
 * on it. Rounding per line also means the printed lines add up to the printed total.
 */
function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Splits a quantity across tiered bands.
 *
 * Progressive: the first band fills before the second takes anything, so 98.22 hours becomes
 * 60 + 20 + 18.22 rather than 98.22 at the top rate. The parts always sum back to the quantity,
 * which is the property that keeps a payslip's lines adding up to its total.
 */
export function splitAcrossTiers(quantity: number, tiers: PayTier[]): number[] {
  const parts: number[] = [];
  let consumed = 0;

  for (const [index, tier] of tiers.entries()) {
    const ceiling = tier.upTo ?? Number.POSITIVE_INFINITY;
    const remaining = Math.max(quantity - consumed, 0);
    const capacity = ceiling - consumed;
    const part = index === tiers.length - 1 ? remaining : Math.min(remaining, Math.max(capacity, 0));

    parts.push(part);
    consumed += part;
  }

  return parts;
}

function tierLines(
  quantity: number,
  tiers: PayTier[],
  rate: number,
  unit: 'h' | 'sectors',
): PayLine[] {
  return splitAcrossTiers(quantity, tiers).map((units, index) => ({
    label: describeTier(tiers, index, unit),
    units: round(units),
    multiplier: tiers[index].multiplier,
    amount: round(units * rate * tiers[index].multiplier),
  }));
}

export function calculatePay(inputs: PayInputs, scheme: PayScheme): PayCalculation {
  const rate = scheme.hourlyRate;

  const hourLines = tierLines(inputs.blockHours, scheme.hourTiers, rate, 'h');
  const hourPay = round(hourLines.reduce((sum, line) => sum + line.amount, 0));

  const nightLine: PayLine = {
    label: 'Night hours',
    units: round(inputs.nightHours),
    multiplier: scheme.nightMultiplier,
    amount: round(inputs.nightHours * rate * scheme.nightMultiplier),
  };

  const sectorLines = tierLines(inputs.sectorCount, scheme.sectorTiers, rate, 'sectors');
  const sectorPay = round(sectorLines.reduce((sum, line) => sum + line.amount, 0));

  const deadheadLine: PayLine = {
    label: inputs.deadheadBasis === 'hours' ? 'Deadhead hours' : 'Deadhead sectors',
    units: round(inputs.deadheadUnits),
    multiplier: scheme.deadheadMultiplier,
    amount: round(inputs.deadheadUnits * rate * scheme.deadheadMultiplier),
  };

  const gross = round(
    scheme.baseSalary + scheme.perDiem + hourPay + nightLine.amount + sectorPay + deadheadLine.amount,
  );

  // Each deduction is taken from what the previous one left, not from the gross. Computing all
  // three as flat percentages of the gross would over-deduct by several thousand tenge.
  const osms = round(gross * scheme.osmsRate);
  const opv = round((gross - osms) * scheme.opvRate);
  const ipn = round((gross - osms - opv) * scheme.ipnRate);
  const totalDeductions = round(osms + opv + ipn);

  return {
    inputs,
    hourLines,
    hourPay,
    nightLine,
    sectorLines,
    sectorPay,
    deadheadLine,
    baseSalary: scheme.baseSalary,
    perDiem: scheme.perDiem,
    gross,
    osms,
    opv,
    ipn,
    totalDeductions,
    net: round(gross - totalDeductions),
  };
}

/**
 * Turns a month of the logbook into the quantities the scheme is paid on.
 *
 * Hours come from stored minutes and are converted exactly — 91:53 is 91.883 hours, not 91.53.
 * That distinction is worth stating because a spreadsheet filled in by hand usually gets the
 * roster's "91:53" typed straight into a decimal cell, which quietly underpays by the difference.
 */
export function payInputsForMonth(month: MonthTotals, scheme: PayScheme): PayInputs {
  const nightMinutes =
    scheme.nightBasis === 'actual' ? month.nightMinutes : month.windowNightMinutes;

  return {
    blockHours: month.blockMinutes / 60,
    nightHours: nightMinutes / 60,
    sectorCount: month.sectorCount,
    deadheadUnits:
      scheme.deadheadBasis === 'hours' ? month.deadheadMinutes / 60 : month.deadheadCount,
    deadheadBasis: scheme.deadheadBasis,
  };
}

export function calculateMonthPay(month: MonthTotals, scheme: PayScheme): PayCalculation {
  return calculatePay(payInputsForMonth(month, scheme), scheme);
}
