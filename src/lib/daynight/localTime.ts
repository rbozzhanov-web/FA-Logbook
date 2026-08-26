import { DateTime } from 'luxon';

import { findAirportTimezone } from './airportDb';

/**
 * Turns a station-local date and clock time into a UTC instant.
 *
 * The pilot logbook this app is built from could skip this entirely: airline *flight-time*
 * reports are written in Zulu, so a date and an "HH:MM" already were an instant. A cabin-crew
 * schedule is not — it says "All times in Local Station" across the top — so every time in it
 * means nothing until it is paired with the timezone of the airport it was read at.
 *
 * Returns undefined rather than guessing when the airport isn't in the database or the runtime
 * can't resolve its zone. Silently falling back to UTC would produce hours that look right and
 * are wrong by up to half a day, which is the worst outcome for a document about hours.
 */
export function stationTimeToUtc(
  date: string,
  hhmm: string,
  airportCode: string,
): DateTime | undefined {
  const zone = findAirportTimezone(airportCode);
  if (!zone) return undefined;

  const parsed = DateTime.fromISO(`${date}T${hhmm}`, { zone });
  return parsed.isValid ? parsed.toUTC() : undefined;
}

/** The reverse: a UTC instant read on the clock at a given station. */
export function utcToStationTime(instant: DateTime, airportCode: string): DateTime | undefined {
  const zone = findAirportTimezone(airportCode);
  if (!zone) return undefined;

  const local = instant.setZone(zone);
  return local.isValid ? local : undefined;
}

export interface SectorTimes {
  departureUtc: DateTime;
  arrivalUtc: DateTime;
  blockMinutes: number;
  /** ISO date of arrival, local at the arrival station. */
  arrivalDate: string;
}

export interface SectorTimesInput {
  /** Local date at the departure station. */
  date: string;
  timeOut: string;
  timeIn: string;
  departureAirport: string;
  arrivalAirport: string;
  /**
   * Local date at the arrival station, when it is known — the roster shows it by carrying the
   * sector into the next day's column. Omit it and the arrival is taken as the first occurrence
   * of `timeIn` at the arrival station after departure, which is right for every sector short
   * of 24 hours.
   */
  arrivalDate?: string;
}

/**
 * Resolves a sector's two station-local clock readings into real instants and the block time
 * between them.
 *
 * With no arrival date given, the arrival is rolled forward day by day until it is after the
 * departure. That is not a hack around midnight alone: crossing timezones eastward can land a
 * sector on the next calendar day at a *lower* clock reading than it left at, and westward can
 * land it on the same day it departed. Anchoring to "the first such clock time after departure"
 * is the one rule that reads both correctly.
 */
export function resolveSectorTimes(input: SectorTimesInput): SectorTimes | undefined {
  const departureUtc = stationTimeToUtc(input.date, input.timeOut, input.departureAirport);
  if (!departureUtc) return undefined;

  const arrivalOn = input.arrivalDate ?? input.date;
  let arrivalUtc = stationTimeToUtc(arrivalOn, input.timeIn, input.arrivalAirport);
  if (!arrivalUtc) return undefined;

  if (!input.arrivalDate) {
    // At most two rolls are ever needed: one calendar day covers any sector, and the second
    // guards the eastward case where the local arrival clock is behind the local departure clock
    // by more than a day's worth of timezone difference.
    for (let roll = 0; roll < 2 && arrivalUtc <= departureUtc; roll += 1) {
      arrivalUtc = arrivalUtc.plus({ days: 1 });
    }
  }

  const blockMinutes = Math.round(arrivalUtc.diff(departureUtc, 'minutes').minutes);
  if (blockMinutes < 0) return undefined;

  const arrivalLocal = arrivalUtc.setZone(arrivalUtc.zone);
  const arrivalStation = utcToStationTime(arrivalUtc, input.arrivalAirport) ?? arrivalLocal;

  return {
    departureUtc,
    arrivalUtc,
    blockMinutes,
    arrivalDate: arrivalStation.toISODate() ?? arrivalOn,
  };
}

/**
 * Whether this runtime can resolve IANA timezones at all.
 *
 * Luxon leans on `Intl.DateTimeFormat`'s `timeZone` support, which every current React Native
 * engine ships — but a build stripped of ICU would silently return invalid DateTimes for every
 * zone, and the app must say so rather than quietly log the wrong hours.
 */
export function timezoneSupportAvailable(): boolean {
  return DateTime.fromISO('2026-07-25T23:55', { zone: 'Asia/Almaty' }).isValid;
}
