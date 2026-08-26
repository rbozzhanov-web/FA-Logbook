/**
 * What the crew member did on a logged day.
 *
 * They are kept apart because they are counted apart. The airline's own crew-schedule report
 * proves the first distinction: its "Block Hours" figure sums operating sectors only, and a
 * deadhead sector — the crew travelling as a passenger to reposition — is excluded from it
 * entirely, even though it sits in the roster grid looking exactly like a flight.
 *
 * `absence` is the odd one out: it carries no hours at all. It exists because a month's figures
 * are not interpretable without it — sixty hours flown in a month with a week of sick leave is a
 * different month from sixty hours flown in a full one.
 */
export type SectorKind = 'operating' | 'deadhead' | 'ground' | 'absence';

export type EntrySource = 'manual' | 'pdf_import';

export interface CabinCrewLogEntry {
  id: string;
  /**
   * ISO "YYYY-MM-DD" — the date at the *departure station's* local time, exactly as the roster
   * prints it. Cabin crew read their roster in station time, so that is what the logbook shows;
   * the UTC instant needed for night hours is derived from this plus the airport's timezone
   * (see `src/lib/daynight/localTime.ts`).
   */
  date: string;
  kind: SectorKind;
  flightNumber?: string;
  /**
   * Airport codes are stored exactly as the roster prints them (IATA: ALA, NQZ, AYT) and exactly
   * as they are typed in. They are never rewritten to ICAO — a cabin-crew log is read against the
   * airline's own roster, not filed with a licensing authority. The airport database is used to
   * *look up* a code (it accepts IATA and ICAO alike), never to canonicalise it.
   */
  departureAirport: string;
  arrivalAirport: string;
  aircraftType?: string;

  /** "HH:MM", local at the departure station. */
  timeOut?: string;
  /** "HH:MM", local at the arrival station. */
  timeIn?: string;
  /**
   * ISO date of arrival, local at the arrival station. Set whenever it differs from `date` —
   * which happens both for sectors that cross midnight and for sectors that cross enough
   * timezones to land on another calendar day. Without it, "23:55 → 09:39" is ambiguous.
   */
  arrivalDate?: string;

  /** Operating block time. Zero for deadhead and ground duties. */
  blockMinutes: number;
  /** Time on a sector flown as a passenger. Zero for anything else. */
  deadheadMinutes: number;
  /** Time on a ground duty — recurrent training, a briefing, a course. */
  groundDutyMinutes: number;

  /**
   * Day/night split of the sector's airborne time, computed from the real position of the sun
   * along the great-circle track (never trusted from the report). They sum to `blockMinutes` on
   * an operating sector and to `deadheadMinutes` on a deadhead one; both are zero on the ground.
   */
  dayMinutes: number;
  nightMinutes: number;

  /**
   * Rank operated on this sector, in the airline's own coding — FJ, FY, PU, IS. Stored as the
   * code rather than a translated title: the roster, the crew list and the crew member all use
   * the code, and inventing a title for a rank the report never spells out would be a guess.
   */
  position?: string;
  /**
   * Roster code for a ground duty (HYGT for hygiene training) or an absence (SICK, UFF). Kept as
   * the airline's own code rather than a translation: the roster's legend defines them, and which
   * ones count as sick leave is a question about the codes, not about a paraphrase of them.
   */
  dutyCode?: string;

  /**
   * The duty this sector belongs to: report time to release time, as "YYYY-MM-DDTHH:MM" in the
   * local time of the station the duty starts and ends at.
   *
   * Carried on every sector of the duty, with `dutySectorIndex` saying which one this is. Duty
   * hours are therefore counted once per duty (from the sector numbered 1) rather than once per
   * sector — a three-sector day is one duty, not three.
   */
  dutyStart?: string;
  dutyEnd?: string;
  dutySectorIndex?: number;
  dutySectorCount?: number;

  captainName?: string;
  purserName?: string;
  otherCrewNames?: string;
  remarks?: string;

  source: EntrySource;
  importBatchId?: string;
  createdAt: string;
  updatedAt: string;
}

export type EntryCounters = Pick<
  CabinCrewLogEntry,
  'blockMinutes' | 'deadheadMinutes' | 'groundDutyMinutes' | 'dayMinutes' | 'nightMinutes'
>;

export const NEW_ENTRY_DEFAULTS: EntryCounters = {
  blockMinutes: 0,
  deadheadMinutes: 0,
  groundDutyMinutes: 0,
  dayMinutes: 0,
  nightMinutes: 0,
};

/** The airborne time of a sector, whichever way it was flown. Zero on the ground. */
export function sectorMinutes(entry: Pick<CabinCrewLogEntry, 'blockMinutes' | 'deadheadMinutes'>): number {
  return entry.blockMinutes + entry.deadheadMinutes;
}

/**
 * Absence codes the roster's own legend defines, and what each means for a month's figures.
 *
 * "SICK - Sickness With Sicknote" is sick leave proper — the thing that explains a short month.
 * "UFF - Unfit To Fly (Temporary Code)" is also a medical absence but a different one, recorded
 * without a sicknote, so it is counted alongside rather than merged in. Days off, downroute days
 * off and standby are not absences in this sense and are not logged at all: this is a logbook,
 * not a copy of the roster.
 */
export const SICK_LEAVE_CODES = new Set(['SICK']);
export const UNFIT_TO_FLY_CODES = new Set(['UFF']);

/** Codes worth logging as an absence. Everything else on a non-duty day is left out. */
export const LOGGED_ABSENCE_CODES = new Set([...SICK_LEAVE_CODES, ...UNFIT_TO_FLY_CODES]);

export function isSickLeave(entry: Pick<CabinCrewLogEntry, 'kind' | 'dutyCode'>): boolean {
  return entry.kind === 'absence' && entry.dutyCode !== undefined && SICK_LEAVE_CODES.has(entry.dutyCode);
}

export function isUnfitToFly(entry: Pick<CabinCrewLogEntry, 'kind' | 'dutyCode'>): boolean {
  return entry.kind === 'absence' && entry.dutyCode !== undefined && UNFIT_TO_FLY_CODES.has(entry.dutyCode);
}
