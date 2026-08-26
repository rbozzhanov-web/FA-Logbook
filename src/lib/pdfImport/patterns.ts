/** "DD/MM" — the day-column headings across the top of the roster grid. */
export const DAY_DDMM_RE = /^([0-3]\d)\/([01]\d)$/;
/** "DD/MM/YYYY" — the report period, and the date column of the crew and memo tables. */
export const DATE_DDMMYYYY_RE = /^([0-3]\d)\/([01]\d)\/(\d{4})$/;

/**
 * A time in a roster cell, optionally flagged actual.
 *
 * "A06:56" is the time the sector actually ran; a bare "06:35" is the scheduled one, printed
 * when no actual was recorded. Both are used as-is — the airline's own Block Hours total is
 * computed from exactly this mix — but which one it was is worth telling the crew member, so the
 * flag is kept rather than stripped.
 */
export const CELL_TIME_RE = /^(A?)([0-2]\d):([0-5]\d)$/;

/** "HH:MM" on its own — report and release times, delays, ground-duty start/end. */
export const TIME_HHMM_RE = /^([0-1]?\d|2[0-3]):([0-5]\d)$/;

/**
 * A station in a sector cell, with the deadhead marker the roster prefixes it with.
 *
 * The asterisk is the grid's way of saying the crew member was aboard as a passenger. It is
 * corroborated by the crew list further down the report, which tags the same person "DHC" on
 * that flight — and by the airline's own totals, which leave the sector out of Block Hours.
 */
export const CELL_STATION_RE = /^(\*?)([A-Z]{3,4})$/;

/** "[321]", "[321L]", "[763]" — the aircraft type flown, as the roster codes it. */
export const CELL_AIRCRAFT_RE = /^\[([A-Z0-9]{2,6})\]$/;

/** A flight number as the grid prints it: digits only, the carrier prefix being implied. */
export const CELL_FLIGHT_NUMBER_RE = /^\d{1,5}$/;

/** The glyph a sector that lands on another day leaves at the foot of its departure column. */
export const CONTINUES_GLYPH = '→';
/** ...and the one that opens the column it lands in. */
export const CONTINUED_GLYPH = '↓';

/**
 * Roster codes that occupy a whole day and are not duties to be logged: days off, sickness,
 * standby. Recognised so the grammar can step over them rather than mistaking a code for a
 * station.
 */
export const NON_DUTY_CODES = new Set(['OFF', 'DOFF', 'UFF', 'SICK', 'AVLB', 'LVE', 'VAC', 'ULV']);

/** Parses "DD/MM/YYYY" into an ISO "YYYY-MM-DD" date. */
export function parseDateDdMmYyyy(token: string): string | null {
  const match = DATE_DDMMYYYY_RE.exec(token.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export interface CellTime {
  /** "HH:MM". */
  time: string;
  /** True when the roster printed it as an actual ("A06:56") rather than a scheduled time. */
  actual: boolean;
}

export function parseCellTime(token: string): CellTime | null {
  const match = CELL_TIME_RE.exec(token.trim());
  if (!match) return null;
  const [, prefix, hh, mm] = match;
  if (Number(hh) > 23) return null;
  return { time: `${hh}:${mm}`, actual: prefix === 'A' };
}

export interface CellStation {
  code: string;
  deadhead: boolean;
}

export function parseCellStation(token: string): CellStation | null {
  const match = CELL_STATION_RE.exec(token.trim());
  if (!match) return null;
  const [, marker, code] = match;
  return { code, deadhead: marker === '*' };
}

export function parseCellAircraft(token: string): string | null {
  const match = CELL_AIRCRAFT_RE.exec(token.trim());
  return match ? match[1] : null;
}

export function isPlainTime(token: string): boolean {
  return TIME_HHMM_RE.test(token.trim());
}

export function isFlightNumber(token: string): boolean {
  return CELL_FLIGHT_NUMBER_RE.test(token.trim());
}
