import { hhmmToMinutes, minutesToHHMM } from '@/src/lib/time';
import { findAirportTimezone } from './airportDb';
import { resolveSectorTimes } from './localTime';

/**
 * The clock rule an airline actually pays night hours on.
 *
 * This is a different question from `nightCalc.ts`, not a cheaper answer to the same one. That
 * module asks "was it dark outside?" and answers it from the sun. This one asks "did the clock
 * read between these two hours?", which is what a rostering department counts and what appears
 * on a crew member's payslip — and it is why a monthly report can state a night total like
 * "40:00" that no astronomical calculation would ever produce.
 *
 * Both are shown. Neither is a substitute for the other.
 */
export interface NightWindow {
  /** Minutes from midnight at which night begins, e.g. 22:00 → 1320. */
  startMinute: number;
  /** Minutes from midnight at which night ends, e.g. 06:00 → 360. */
  endMinute: number;
  /**
   * Which clock the window is read on.
   *
   * `station` reads the departure station's local clock for the whole sector — the usual
   * contractual basis, and the one that matches how the roster itself is written. `utc` reads
   * Zulu, for agreements written that way.
   */
  basis: 'station' | 'utc';
}

export const DEFAULT_NIGHT_WINDOW: NightWindow = {
  startMinute: 22 * 60,
  endMinute: 6 * 60,
  basis: 'station',
};

/**
 * True when a minute-of-day falls inside the window.
 *
 * The window normally wraps midnight (22:00 → 06:00), so it is two intervals, not one. A window
 * whose ends are equal is treated as empty rather than as the whole day: "night starts and ends
 * at 22:00" is far more likely to be a half-filled setting than a claim that every hour is night.
 */
export function isMinuteInWindow(minuteOfDay: number, window: NightWindow): boolean {
  const { startMinute, endMinute } = window;
  if (startMinute === endMinute) return false;
  if (startMinute < endMinute) return minuteOfDay >= startMinute && minuteOfDay < endMinute;
  return minuteOfDay >= startMinute || minuteOfDay < endMinute;
}

export interface WindowNightInput {
  /** Local date at the departure station, "YYYY-MM-DD". */
  date: string;
  departureAirport: string;
  arrivalAirport: string;
  timeOut: string;
  timeIn: string;
  arrivalDate?: string;
}

const SAMPLE_STEP_MINUTES = 1;

/**
 * Minutes of a sector that fall inside the night window.
 *
 * Sampled minute by minute against the reference clock rather than computed from the endpoints:
 * a long sector can cross the window's edges more than once, and on the `station` basis the
 * reference zone can shift under it at a DST boundary. At one sample per minute the longest
 * sector any crew member flies costs under a thousand cheap comparisons.
 */
export function calculateWindowNight(
  input: WindowNightInput,
  window: NightWindow = DEFAULT_NIGHT_WINDOW,
): number | undefined {
  const times = resolveSectorTimes(input);
  if (!times) return undefined;

  const { departureUtc, blockMinutes } = times;
  if (blockMinutes <= 0) return 0;

  // "utc" reads Zulu; "station" reads the departure station's own clock, which is the zone the
  // roster printed timeOut in — never the device's local zone, which has nothing to do with
  // where the crew member was.
  const zone = window.basis === 'utc' ? 'utc' : findAirportTimezone(input.departureAirport);
  if (!zone) return undefined;

  let nightMinutes = 0;
  for (let elapsed = 0; elapsed < blockMinutes; elapsed += SAMPLE_STEP_MINUTES) {
    const width = Math.min(SAMPLE_STEP_MINUTES, blockMinutes - elapsed);
    const instant = departureUtc.plus({ minutes: elapsed + width / 2 }).setZone(zone);
    if (isMinuteInWindow(instant.hour * 60 + instant.minute, window)) nightMinutes += width;
  }

  return nightMinutes;
}

/**
 * Stored as "22:00-06:00 station" — legible in a backup file rather than an opaque blob, because
 * a night total is not interpretable without the rule it was counted under.
 */
export function serializeNightWindow(window: NightWindow): string {
  return `${minutesToHHMM(window.startMinute)}-${minutesToHHMM(window.endMinute)} ${window.basis}`;
}

export function parseNightWindow(raw: string | undefined): NightWindow | undefined {
  if (!raw) return undefined;

  const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})\s+(station|utc)$/.exec(raw.trim());
  if (!match) return undefined;

  const startMinute = hhmmToMinutes(match[1]);
  const endMinute = hhmmToMinutes(match[2]);
  if (startMinute === null || endMinute === null) return undefined;

  return { startMinute, endMinute, basis: match[3] as NightWindow['basis'] };
}

/** The window in words, so it can be checked against a crew agreement without decoding it. */
export function describeNightWindow(window: NightWindow): string {
  const where = window.basis === 'utc' ? 'UTC' : 'local time at the departure station';
  return `${minutesToHHMM(window.startMinute)}\u2013${minutesToHHMM(window.endMinute)}, ${where}`;
}
