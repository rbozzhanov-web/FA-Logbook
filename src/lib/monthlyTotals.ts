import { NightWindow } from '@/src/lib/daynight/nightWindow';
import { crewPayNormCoversDate, findCrewPayNormMinutes } from '@/src/lib/pay/crewPayNorm';
import { CabinCrewLogEntry, isSickLeave, isUnfitToFly } from '@/src/types/logbook';
import { entryDutyMinutes, isFirstSectorOfDuty, windowNightFor } from './summary';

/**
 * The block-hour thresholds a month's flying is banded against.
 *
 * These are the numbers a productivity agreement is written in: hours up to the first threshold,
 * hours between the two, hours beyond the second. They are constants rather than a setting
 * because they came from the crew member's own agreement — if a different contract uses
 * different figures, this is the one place to change them.
 */
export const BAND_LOWER_HOURS = 60;
export const BAND_UPPER_HOURS = 80;

const BAND_LOWER_MINUTES = BAND_LOWER_HOURS * 60;
const BAND_UPPER_MINUTES = BAND_UPPER_HOURS * 60;

/**
 * A month's block hours split across the bands.
 *
 * Progressive, not a single label: a month of 91:53 contributes 60:00 to the base band, 20:00 to
 * the 60–80 band and 11:53 above 80. That is how a tiered agreement actually pays, and it also
 * answers the simpler question — which band the month *reached* is visible from which portions
 * are non-zero. The three always sum to the month's block hours exactly.
 */
export interface BandSplit {
  /** Up to the lower threshold. */
  baseMinutes: number;
  /** Between the two thresholds. */
  midMinutes: number;
  /** Beyond the upper threshold. */
  highMinutes: number;
}

export function splitIntoBands(blockMinutes: number): BandSplit {
  const total = Math.max(0, blockMinutes);
  return {
    baseMinutes: Math.min(total, BAND_LOWER_MINUTES),
    midMinutes: Math.min(Math.max(total - BAND_LOWER_MINUTES, 0), BAND_UPPER_MINUTES - BAND_LOWER_MINUTES),
    highMinutes: Math.max(total - BAND_UPPER_MINUTES, 0),
  };
}

/** Which band a month's total reached, for labelling the row. */
export type BandReached = 'under' | 'mid' | 'high';

export function bandReached(blockMinutes: number): BandReached {
  if (blockMinutes > BAND_UPPER_MINUTES) return 'high';
  if (blockMinutes >= BAND_LOWER_MINUTES) return 'mid';
  return 'under';
}

export interface MonthTotals {
  /** "YYYY-MM" — stable key, and sortable. */
  key: string;
  /** e.g. "July 2026". */
  label: string;

  /** Operating sectors worked. */
  sectorCount: number;
  deadheadCount: number;

  /** Operating block time — the figure the bands are computed from. */
  blockMinutes: number;
  /**
   * The same sectors, each counted at the airline's published CrewPay Norm block time where its
   * route is listed and its date falls in that table's effective window, and at its own actual
   * `blockMinutes` otherwise — the figure the Pay tab defaults to. Never affects the bands above.
   */
  normBlockMinutes: number;
  bands: BandSplit;
  band: BandReached;

  deadheadMinutes: number;
  groundDutyMinutes: number;
  dutyMinutes: number;

  /** Night from the sun's real position, and under the configured clock rule. */
  nightMinutes: number;
  windowNightMinutes: number;

  /** Days of certified sick leave, and of temporary unfitness, in this month. */
  sickDays: number;
  unfitDays: number;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function emptyMonth(key: string): MonthTotals {
  const [year, month] = key.split('-');
  return {
    key,
    label: `${MONTH_NAMES[Number(month) - 1] ?? month} ${year}`,
    sectorCount: 0,
    deadheadCount: 0,
    blockMinutes: 0,
    normBlockMinutes: 0,
    bands: { baseMinutes: 0, midMinutes: 0, highMinutes: 0 },
    band: 'under',
    deadheadMinutes: 0,
    groundDutyMinutes: 0,
    dutyMinutes: 0,
    nightMinutes: 0,
    windowNightMinutes: 0,
    sickDays: 0,
    unfitDays: 0,
  };
}

/**
 * Every month the logbook covers, newest first.
 *
 * Months come from the "YYYY-MM-DD" date string directly, never parsed through Date — a Date
 * round trip would apply the device timezone and could shift a sector flown on the 1st or the
 * 31st into the wrong month, which is exactly where a band threshold is decided.
 */
export function monthlyTotals(
  entries: CabinCrewLogEntry[],
  window?: NightWindow,
): MonthTotals[] {
  const byKey = new Map<string, MonthTotals>();

  const monthFor = (date: string): MonthTotals => {
    const key = date.slice(0, 7);
    let month = byKey.get(key);
    if (!month) {
      month = emptyMonth(key);
      byKey.set(key, month);
    }
    return month;
  };

  for (const entry of entries) {
    const month = monthFor(entry.date);

    if (entry.kind === 'operating') {
      month.sectorCount += 1;
      month.blockMinutes += entry.blockMinutes;
      const norm = crewPayNormCoversDate(entry.date)
        ? findCrewPayNormMinutes(entry.departureAirport, entry.arrivalAirport)
        : undefined;
      month.normBlockMinutes += norm ?? entry.blockMinutes;
      month.nightMinutes += entry.nightMinutes;
      if (window) month.windowNightMinutes += windowNightFor(entry, window);
    } else if (entry.kind === 'deadhead') {
      month.deadheadCount += 1;
      month.deadheadMinutes += entry.deadheadMinutes;
    } else if (entry.kind === 'ground') {
      month.groundDutyMinutes += entry.groundDutyMinutes;
    } else if (isSickLeave(entry)) {
      month.sickDays += 1;
    } else if (isUnfitToFly(entry)) {
      month.unfitDays += 1;
    }

    // Duty hours belong to the duty, not the sector, so they are counted from the duty's first
    // sector only — the same rule the whole-logbook totals use.
    if (isFirstSectorOfDuty(entry)) {
      month.dutyMinutes += entryDutyMinutes(entry) ?? 0;
    }
  }

  // Banding is done after the month is complete: a band is a property of the month's total, and
  // computing it per entry would band each sector on its own.
  const months = [...byKey.values()];
  for (const month of months) {
    month.bands = splitIntoBands(month.blockMinutes);
    month.band = bandReached(month.blockMinutes);
  }

  return months.sort((a, b) => (a.key < b.key ? 1 : -1));
}

export interface BandTotals {
  midMinutes: number;
  highMinutes: number;
  /** Months whose block hours reached each band. */
  monthsInMid: number;
  monthsInHigh: number;
  sickDays: number;
  unfitDays: number;
  monthsWithSickLeave: number;
}

/**
 * The band figures across the whole logbook.
 *
 * Summed per month and then added up, never computed from the career total: banding is a
 * monthly rule, and applying it to a career's hours would put every month above the threshold.
 */
export function bandTotals(months: MonthTotals[]): BandTotals {
  const totals: BandTotals = {
    midMinutes: 0,
    highMinutes: 0,
    monthsInMid: 0,
    monthsInHigh: 0,
    sickDays: 0,
    unfitDays: 0,
    monthsWithSickLeave: 0,
  };

  for (const month of months) {
    totals.midMinutes += month.bands.midMinutes;
    totals.highMinutes += month.bands.highMinutes;
    if (month.band === 'mid') totals.monthsInMid += 1;
    if (month.band === 'high') totals.monthsInHigh += 1;
    totals.sickDays += month.sickDays;
    totals.unfitDays += month.unfitDays;
    if (month.sickDays > 0) totals.monthsWithSickLeave += 1;
  }

  return totals;
}
