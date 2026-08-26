import { MonthTotals } from '@/src/lib/monthlyTotals';
import { DeadheadBasis, PayScheme, PayTier, describeTier } from './payScheme';

/**
 * A month's pay, worked out from the logbook.
 *
 * Laid out to mirror a real payslip line for line, because that is what it will be checked
 * against: every figure carries the quantity and the multiplier it came from, so a disagreement
 * can be traced to a line rather than to "the app says something else".
 */

export interface PayLine {
  label: string;
  /** Hours (decimal), sectors, or days — whichever this line is counted in. */
  units: number;
  multiplier: number;
  amount: number;
}

export interface PayInputs {
  /** Operating block time, in decimal hours (rounded to 2 dp before use, matching payroll practice). */
  blockHours: number;
  /** The night figure the scheme pays on, in decimal hours. */
  nightHours: number;
  /** Operating sectors. Positioning is paid separately and never reaches the sector bands. */
  sectorCount: number;
  /** Positioning, in whichever unit the scheme pays it by. */
  deadheadUnits: number;
  deadheadBasis: DeadheadBasis;

  /** Calendar days in the month, for prorating the fixed pay and for context on paid days. */
  daysInMonth: number;
  /** Certified sick leave days — paid per day, and never a share of the month's flying. */
  sickDays: number;
  /** Days unfit to fly — no cash pay of their own, but they still reduce paid days like sickness. */
  unfitDays: number;
}

export interface PayCalculation {
  inputs: PayInputs;
  /** Calendar days minus sick and unfit days — what salary and travel allowance are prorated by. */
  paidDays: number;

  salaryLine: PayLine;
  transportLine: PayLine;
  sickLine: PayLine;

  /** The base line ("all hours" at the first tier's rate) plus a top-up for each higher band. */
  hourBaseLine: PayLine;
  hourSurchargeLines: PayLine[];
  hourPay: number;

  nightLine: PayLine;

  sectorLines: PayLine[];
  sectorPay: number;

  deadheadLine: PayLine;

  gross: number;

  osms: number;
  opv: number;
  ipn: number;
  totalDeductions: number;
  net: number;
}

/**
 * Rounds a money amount to the whole tenge.
 *
 * This is the rounding the payslip's own hour, night, sector, positioning and salary lines use —
 * confirmed by reproducing every one of them from the same real payslip. It is not cosmetic: an
 * hour-based line computed from a rate that isn't a round number of tenge would otherwise carry
 * fractional tenge no payslip prints, and salary specifically is rounded this way even though
 * its own arithmetic (a fraction of days) does not naturally land on a whole number.
 */
function round0(amount: number): number {
  return Math.round(amount);
}

/**
 * Rounds a money amount to the tenge and its hundredths (kopecks).
 *
 * Used for the travel allowance and sick pay — the two lines the same payslip prints *with*
 * decimals — and for the deductions and totals, whose own arithmetic never lands on a whole
 * number to begin with.
 */
function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Splits a quantity across tiered bands.
 *
 * Progressive: the first band fills before the second takes anything, so 95.43 hours becomes
 * 60 + 20 + 15.43 rather than 95.43 at the top rate. The parts always sum back to the quantity.
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

/**
 * The days in a given "YYYY-MM" month, Gregorian leap years included.
 *
 * Deliberately not `new Date(...).getDate()`: a Date computation would go through the runtime's
 * local timezone, which has nothing to do with which calendar month a roster date names.
 */
function daysInCalendarMonth(monthKey: string): number {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 30;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function tierLines(quantity: number, tiers: PayTier[], rate: number, unit: 'h' | 'sectors'): PayLine[] {
  return splitAcrossTiers(quantity, tiers).map((units, index) => ({
    label: describeTier(tiers, index, unit),
    units: round2(units),
    multiplier: tiers[index].multiplier,
    amount: round0(units * rate * tiers[index].multiplier),
  }));
}

export function calculatePay(inputs: PayInputs, scheme: PayScheme): PayCalculation {
  const rate = scheme.hourlyRate;

  // Rounded once, up front: this is the same rounding a payroll system applies before printing
  // the "Часы" column, and every line derived from it (base pay, the tier top-ups, and night
  // when it is read as half of the block) has to start from that rounded figure to land on the
  // same tenge the payslip does.
  const blockHours = round2(inputs.blockHours);

  const unpaidAbsenceDays = inputs.sickDays + inputs.unfitDays;
  const paidDays = Math.max(inputs.daysInMonth - unpaidAbsenceDays, 0);
  const attendanceShare = scheme.proratesFixedPayByAbsence ? paidDays / inputs.daysInMonth : 1;

  const salaryLine: PayLine = {
    label: 'Salary',
    units: paidDays,
    multiplier: attendanceShare,
    amount: round0(scheme.monthlySalary * attendanceShare),
  };

  const transportLine: PayLine = {
    label: 'Travel allowance',
    units: paidDays,
    multiplier: attendanceShare,
    amount: round2(scheme.monthlyTransport * attendanceShare),
  };

  const sickLine: PayLine = {
    label: 'Sick pay',
    units: inputs.sickDays,
    multiplier: scheme.dailySickPayRate,
    amount: round2(inputs.sickDays * scheme.dailySickPayRate),
  };

  // The hour bands are stored as an effective rate per band (60–80 "is worth ×2"), but a real
  // payslip pays the base rate on every hour and then tops up only the higher bands — two ways
  // of printing the identical total. This mirrors that: one base line across all the hours, plus
  // one top-up line per band above the first, each top-up being (that band's effective rate
  // minus the base rate) applied only to the hours actually inside it.
  const hourParts = splitAcrossTiers(blockHours, scheme.hourTiers);
  const baseMultiplier = scheme.hourTiers[0]?.multiplier ?? 1;

  const hourBaseLine: PayLine = {
    label: 'All hours',
    units: blockHours,
    multiplier: baseMultiplier,
    amount: round0(blockHours * rate * baseMultiplier),
  };

  const hourSurchargeLines: PayLine[] = scheme.hourTiers.slice(1).map((tier, i) => {
    const hours = hourParts[i + 1];
    const extra = tier.multiplier - baseMultiplier;
    return {
      label: describeTier(scheme.hourTiers, i + 1, 'h'),
      units: round2(hours),
      multiplier: extra,
      amount: round0(hours * rate * extra),
    };
  });

  const hourPay =
    hourBaseLine.amount + hourSurchargeLines.reduce((sum, line) => sum + line.amount, 0);

  const nightLine: PayLine = {
    label: 'Night hours',
    units: round2(inputs.nightHours),
    multiplier: scheme.nightMultiplier,
    amount: round0(inputs.nightHours * rate * scheme.nightMultiplier),
  };

  const sectorLines = tierLines(inputs.sectorCount, scheme.sectorTiers, rate, 'sectors');
  const sectorPay = sectorLines.reduce((sum, line) => sum + line.amount, 0);

  const deadheadLine: PayLine = {
    label: inputs.deadheadBasis === 'hours' ? 'Deadhead hours' : 'Deadhead sectors',
    units: round2(inputs.deadheadUnits),
    multiplier: scheme.deadheadMultiplier,
    amount: round0(inputs.deadheadUnits * rate * scheme.deadheadMultiplier),
  };

  // The gross is the sum of the already-rounded lines, not a fresh rounding of the exact total —
  // that is what the payslip itself does (its printed lines sum exactly to its printed gross),
  // and departing from it would report a total the individual lines above don't actually add to.
  const gross = round2(
    salaryLine.amount +
      transportLine.amount +
      sickLine.amount +
      hourPay +
      nightLine.amount +
      sectorPay +
      deadheadLine.amount,
  );

  // ОСМС and ОПВ are each a flat rate of the full gross — not cascaded off one another. Only ИПН
  // is computed on what is left after both of them, and after the standard deduction.
  const osms = round0(gross * scheme.osmsRate);
  const opv = round2(gross * scheme.opvRate);
  const ipnBase = Math.max(gross - opv - osms - scheme.ipnStandardDeduction, 0);
  const ipn = round0(ipnBase * scheme.ipnRate);
  const totalDeductions = round2(osms + opv + ipn);

  return {
    inputs,
    paidDays,
    salaryLine,
    transportLine,
    sickLine,
    hourBaseLine,
    hourSurchargeLines,
    hourPay,
    nightLine,
    sectorLines,
    sectorPay,
    deadheadLine,
    gross,
    osms,
    opv,
    ipn,
    totalDeductions,
    net: round2(gross - totalDeductions),
  };
}

/**
 * Turns a month of the logbook into the quantities the scheme is paid on.
 *
 * Hours come from stored minutes and are converted exactly — 95:26 is 95.4333… hours before
 * `calculatePay` rounds it to 95.43, not 95.26. That distinction is worth stating because a
 * spreadsheet filled in by hand usually gets the roster's "95:26" typed straight into a decimal
 * cell, which is a different, and wrong, number.
 */
export function payInputsForMonth(month: MonthTotals, scheme: PayScheme): PayInputs {
  const blockHours = month.blockMinutes / 60;

  const nightHours =
    scheme.nightBasis === 'halfBlock'
      ? Math.round(blockHours * 100) / 100 / 2
      : scheme.nightBasis === 'actual'
        ? month.nightMinutes / 60
        : month.windowNightMinutes / 60;

  return {
    blockHours,
    nightHours,
    sectorCount: month.sectorCount,
    deadheadUnits:
      scheme.deadheadBasis === 'hours' ? month.deadheadMinutes / 60 : month.deadheadCount,
    deadheadBasis: scheme.deadheadBasis,
    daysInMonth: daysInCalendarMonth(month.key),
    sickDays: month.sickDays,
    unfitDays: month.unfitDays,
  };
}

export function calculateMonthPay(month: MonthTotals, scheme: PayScheme): PayCalculation {
  return calculatePay(payInputsForMonth(month, scheme), scheme);
}
