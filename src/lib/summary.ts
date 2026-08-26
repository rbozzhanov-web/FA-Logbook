import { calculateWindowNight, DEFAULT_NIGHT_WINDOW, NightWindow } from '@/src/lib/daynight/nightWindow';
import { CabinCrewLogEntry, isSickLeave, isUnfitToFly } from '@/src/types/logbook';
import { hhmmToMinutes } from './time';

/**
 * Every figure the logbook reports, totalled from the entries themselves.
 *
 * Computed in JavaScript rather than as a SQL aggregate, and shared by the totals screen, the
 * month and year headers and the printed logbook, so those three can never disagree with each
 * other — the failure that would matter most in a document handed to someone else. Two of the
 * figures could not be done in SQL anyway: duty hours have to be counted once per duty rather
 * than once per row, and the contractual night count is recomputed from the sector's times
 * against whichever window is configured.
 */
export interface LogbookSummary {
  /** Operating sectors — the ones actually worked. */
  sectorCount: number;
  deadheadCount: number;
  groundDutyCount: number;

  blockMinutes: number;
  deadheadMinutes: number;
  groundDutyMinutes: number;
  /** Block + deadhead: total time spent airborne, however the sector was flown. */
  airborneMinutes: number;

  /** Day/night split of operating sectors, from the real position of the sun. */
  dayMinutes: number;
  nightMinutes: number;
  /** ...and the same split including sectors flown as a passenger. */
  nightMinutesInclDeadhead: number;

  /** Night under the configured clock rule — the figure an airline pays on. */
  windowNightMinutes: number;

  /** Report-to-release time, counted once per duty. */
  dutyMinutes: number;
  dutyCount: number;

  /** Sectors that departed or landed in darkness. */
  nightSectorCount: number;

  /** Days of certified sick leave, and of temporary unfitness to fly. */
  sickDays: number;
  unfitDays: number;
}

export const ZERO_SUMMARY: LogbookSummary = {
  sectorCount: 0,
  deadheadCount: 0,
  groundDutyCount: 0,
  blockMinutes: 0,
  deadheadMinutes: 0,
  groundDutyMinutes: 0,
  airborneMinutes: 0,
  dayMinutes: 0,
  nightMinutes: 0,
  nightMinutesInclDeadhead: 0,
  windowNightMinutes: 0,
  dutyMinutes: 0,
  dutyCount: 0,
  nightSectorCount: 0,
  sickDays: 0,
  unfitDays: 0,
};

export function summarise(
  entries: CabinCrewLogEntry[],
  window: NightWindow = DEFAULT_NIGHT_WINDOW,
): LogbookSummary {
  const summary: LogbookSummary = { ...ZERO_SUMMARY };

  for (const entry of entries) {
    if (entry.kind === 'absence') {
      // Carries no hours by construction, and must never fall through to the operating branch —
      // a sick day counted as a sector would inflate the count and leave the hours at zero.
      if (isSickLeave(entry)) summary.sickDays += 1;
      else if (isUnfitToFly(entry)) summary.unfitDays += 1;
    } else if (entry.kind === 'ground') {
      summary.groundDutyCount += 1;
      summary.groundDutyMinutes += entry.groundDutyMinutes;
    } else if (entry.kind === 'deadhead') {
      summary.deadheadCount += 1;
      summary.deadheadMinutes += entry.deadheadMinutes;
      summary.nightMinutesInclDeadhead += entry.nightMinutes;
    } else {
      summary.sectorCount += 1;
      summary.blockMinutes += entry.blockMinutes;
      summary.dayMinutes += entry.dayMinutes;
      summary.nightMinutes += entry.nightMinutes;
      summary.nightMinutesInclDeadhead += entry.nightMinutes;
      if (entry.nightMinutes > 0) summary.nightSectorCount += 1;
      summary.windowNightMinutes += windowNightFor(entry, window);
    }

    // Duty hours belong to the duty, not the sector. A three-sector day is one duty, and adding
    // it up per row would report it three times over.
    if (entry.kind !== 'absence' && isFirstSectorOfDuty(entry)) {
      const minutes = entryDutyMinutes(entry);
      if (minutes !== undefined) {
        summary.dutyMinutes += minutes;
        summary.dutyCount += 1;
      }
    }
  }

  summary.airborneMinutes = summary.blockMinutes + summary.deadheadMinutes;
  return summary;
}

/**
 * True for exactly one sector of each duty.
 *
 * An entry with no duty information at all — typed in by hand, or imported from a roster that
 * left the duty open — counts as its own duty rather than being dropped, so manually kept hours
 * are not silently missing from the total.
 */
export function isFirstSectorOfDuty(entry: CabinCrewLogEntry): boolean {
  return entry.dutySectorIndex === undefined || entry.dutySectorIndex === 1;
}

/** Length of the duty an entry belongs to, or undefined when the roster left one end open. */
export function entryDutyMinutes(entry: CabinCrewLogEntry): number | undefined {
  if (!entry.dutyStart || !entry.dutyEnd) return undefined;

  const start = localDateTimeToMinutes(entry.dutyStart);
  const end = localDateTimeToMinutes(entry.dutyEnd);
  if (start === undefined || end === undefined) return undefined;

  const elapsed = end - start;
  return elapsed >= 0 ? elapsed : undefined;
}

function localDateTimeToMinutes(value: string): number | undefined {
  const [date, time] = value.split('T');
  const minutes = hhmmToMinutes(time);
  if (minutes === null) return undefined;

  const [year, month, day] = date.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return undefined;

  return (Date.UTC(year, month - 1, day) / 86_400_000) * 1440 + minutes;
}

/**
 * The sector's night under the configured clock rule.
 *
 * Recomputed from the entry's own times rather than stored, so changing the window in Settings
 * re-reports the whole logbook immediately instead of only affecting sectors imported afterwards.
 */
export function windowNightFor(entry: CabinCrewLogEntry, window: NightWindow): number {
  if (!entry.timeOut || !entry.timeIn) return 0;

  return (
    calculateWindowNight(
      {
        date: entry.date,
        departureAirport: entry.departureAirport,
        arrivalAirport: entry.arrivalAirport,
        timeOut: entry.timeOut,
        timeIn: entry.timeIn,
        arrivalDate: entry.arrivalDate,
      },
      window,
    ) ?? 0
  );
}
