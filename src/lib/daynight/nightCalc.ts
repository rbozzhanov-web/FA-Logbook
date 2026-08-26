import { DateTime } from 'luxon';

import { findAirportCoords, AirportCoords } from './airportDb';
import { resolveSectorTimes } from './localTime';
import { isNight } from './sunPosition';

export interface NightCalcInput {
  /** Local date at the departure station, "YYYY-MM-DD". */
  date: string;
  departureAirport: string;
  arrivalAirport: string;
  /** "HH:MM" local at the departure station. */
  timeOut: string;
  /** "HH:MM" local at the arrival station. */
  timeIn: string;
  /** Local date at the arrival station, when the roster states it. */
  arrivalDate?: string;
}

export interface NightCalcResult {
  blockMinutes: number;
  dayMinutes: number;
  nightMinutes: number;
  /** Local date at the arrival station, resolved from the two clock times. */
  arrivalDate: string;
  departureUtc: DateTime;
  arrivalUtc: DateTime;
}

const SAMPLE_STEP_MINUTES = 1;
const RAD = Math.PI / 180;

/** Logbook convention: day/night are kept to the nearest 5 minutes. */
const ROUNDING_MINUTES = 5;

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Interpolates a point along the great-circle track between two airports, parameterized by
 * elapsed-time fraction (0 = departure, 1 = arrival), assuming constant ground speed. This is
 * the standard simplification EFB/logbook tools use when the actual flown track isn't known.
 */
function interpolateGreatCircle(from: AirportCoords, to: AirportCoords, fraction: number): AirportCoords {
  const lat1 = from.lat * RAD;
  const lon1 = from.lon * RAD;
  const lat2 = to.lat * RAD;
  const lon2 = to.lon * RAD;

  const angularDistance =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );

  if (angularDistance < 1e-9) return from; // same airport (e.g. an air-return)

  const a = Math.sin((1 - fraction) * angularDistance) / Math.sin(angularDistance);
  const b = Math.sin(fraction * angularDistance) / Math.sin(angularDistance);

  const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
  const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);

  const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lon = Math.atan2(y, x);

  return { lat: lat / RAD, lon: lon / RAD };
}

/**
 * Splits a sector into day and night from the real position of the sun along its track, using
 * civil twilight (sun 6° below the horizon) as the ICAO/EASA night boundary.
 *
 * Deliberately computed rather than read off the report. The roster carries a single monthly
 * "Night Hours" figure and no per-sector breakdown at all, and that figure is the airline's own
 * contractual count — which is a clock rule, not an astronomical one (see `nightWindow.ts`).
 * A crew member who wants to know how much of a given sector was actually flown in darkness can
 * only get it this way.
 *
 * Returns undefined when either airport is unknown or the times can't be resolved to instants.
 */
export function calculateDayNight(input: NightCalcInput): NightCalcResult | undefined {
  const depCoords = findAirportCoords(input.departureAirport);
  const arrCoords = findAirportCoords(input.arrivalAirport);
  if (!depCoords || !arrCoords) return undefined;

  const times = resolveSectorTimes({
    date: input.date,
    timeOut: input.timeOut,
    timeIn: input.timeIn,
    departureAirport: input.departureAirport,
    arrivalAirport: input.arrivalAirport,
    arrivalDate: input.arrivalDate,
  });
  if (!times) return undefined;

  const { departureUtc, arrivalUtc, blockMinutes } = times;

  let nightMinutes = 0;
  if (blockMinutes > 0) {
    for (let elapsed = 0; elapsed < blockMinutes; elapsed += SAMPLE_STEP_MINUTES) {
      const sampleWidth = Math.min(SAMPLE_STEP_MINUTES, blockMinutes - elapsed);
      const midpoint = elapsed + sampleWidth / 2;
      const fraction = midpoint / blockMinutes;
      const instant = departureUtc.plus({ minutes: midpoint }).toJSDate();
      const position = interpolateGreatCircle(depCoords, arrCoords, fraction);
      if (isNight(instant, position)) nightMinutes += sampleWidth;
    }
  }

  // Logbooks are kept to the nearest 5 minutes, so round the night figure — but only the night
  // figure, deriving day from it. Rounding both independently would let them stop summing to
  // block time (e.g. 02:32 total → 01:15 night + 01:15 day loses two minutes), and a logbook
  // whose columns don't add up to the total is wrong on its face.
  //
  // A sector that was entirely night (or entirely day) is the exception: it keeps the exact
  // block time. Rounding 263 minutes of unbroken night down to 260 would claim three minutes of
  // daylight that never happened, which is a worse error than the odd minute it tidies away.
  const isSingleCondition = nightMinutes === 0 || nightMinutes >= blockMinutes;
  nightMinutes = isSingleCondition
    ? Math.min(nightMinutes, blockMinutes)
    : roundToNearest(nightMinutes, ROUNDING_MINUTES);

  return {
    blockMinutes,
    nightMinutes,
    dayMinutes: blockMinutes - nightMinutes,
    arrivalDate: times.arrivalDate,
    departureUtc,
    arrivalUtc,
  };
}
