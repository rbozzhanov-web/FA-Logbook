import { hhmmToMinutes } from '@/src/lib/time';
import { LOGGED_ABSENCE_CODES } from '@/src/types/logbook';
import {
  CONTINUED_GLYPH,
  CONTINUES_GLYPH,
  NON_DUTY_CODES,
  isFlightNumber,
  isPlainTime,
  parseCellAircraft,
  parseCellStation,
  parseCellTime,
} from '../patterns';
import { DayColumn, resolveGridDate } from './grid';

/**
 * One sector as the grid states it, before any hours are computed. Times are still the station's
 * own clock — turning them into real elapsed time is `localTime.ts`'s job, and it needs both
 * stations' timezones to do it.
 */
export interface RosterSector {
  flightNumber: string;
  /** Local date at the departure station. */
  date: string;
  departureAirport: string;
  arrivalAirport: string;
  /** "HH:MM" local at the departure station. */
  timeOut: string;
  /** "HH:MM" local at the arrival station. */
  timeIn: string;
  /** Local date at the arrival station, when the sector lands in a later day's column. */
  arrivalDate?: string;
  aircraftType?: string;
  deadhead: boolean;
  /** False when the roster printed a scheduled time rather than an actual one. */
  actualTimes: boolean;
  dutyIndex: number;
  /** 1-based position of this sector within its duty. */
  dutySectorIndex: number;
}

/** A day the crew member was absent: sick, or temporarily unfit to fly. Carries no hours. */
export interface RosterAbsence {
  code: string;
  date: string;
}

/** A ground duty: a training course, a briefing — a real duty with hours but no aircraft. */
export interface RosterGroundDuty {
  code: string;
  date: string;
  start: string;
  end: string;
  dutyIndex: number;
}

export interface RosterDuty {
  index: number;
  /** "YYYY-MM-DDTHH:MM" local at the station the duty reports at. */
  start?: string;
  end?: string;
  sectorCount: number;
}

export interface RosterReading {
  sectors: RosterSector[];
  groundDuties: RosterGroundDuty[];
  absences: RosterAbsence[];
  duties: RosterDuty[];
  /** Cells the grammar could not place, so an unfamiliar roster variant is visible, not silent. */
  unreadCells: string[];
}

/** The label the roster prints ahead of a duty's accumulated delay. */
const DELAY_LABEL = 'Delay';

/**
 * A ground-duty code: letters, sometimes with digits, standing alone in a cell.
 *
 * Matched by shape rather than from a fixed list because the codes are airline- and
 * year-specific (the sample roster's own legend defines six, a different month would define
 * others). The shape is safe here because the grammar only reaches this test after flight
 * numbers, times, stations and aircraft types have all been ruled out.
 */
const GROUND_DUTY_CODE_RE = /^[A-Z][A-Z0-9_]{1,7}$/;

/**
 * Reads the whole month's grid into duties, sectors and ground duties.
 *
 * The grammar is positional: within a day's column, a report time opens a duty, flight numbers
 * open sectors inside it, and a bare time after the last sector closes it. What makes the format
 * awkward is that a sector is not confined to one column — a departure at 23:09 lands in
 * tomorrow's, leaving an arrow at the foot of one column and picking up under a matching arrow at
 * the head of the next. So the reader carries a sector across the column boundary rather than
 * treating each day independently.
 */
export function readRoster(columns: DayColumn[], periodStart: string, periodEnd: string): RosterReading {
  const sectors: RosterSector[] = [];
  const groundDuties: RosterGroundDuty[] = [];
  const absences: RosterAbsence[] = [];
  const duties: RosterDuty[] = [];
  const unreadCells: string[] = [];

  /** The sector left hanging by a "→" at the foot of the previous column. */
  let carried: RosterSector | undefined;
  let currentDuty: RosterDuty | undefined;

  const openDuty = (): RosterDuty => {
    const duty: RosterDuty = { index: duties.length, sectorCount: 0 };
    duties.push(duty);
    currentDuty = duty;
    return duty;
  };

  for (const column of columns) {
    const date = resolveGridDate(column.label, periodStart, periodEnd);
    if (!date) continue;

    const cells = column.cells;
    let i = 0;

    while (i < cells.length) {
      const cell = cells[i];

      // A sector carried in from yesterday: this column opens with the arrival half of it.
      if (cell === CONTINUED_GLYPH) {
        i += 1;
        if (!carried) continue;
        i = completeCarriedSector(carried, cells, i, date);
        sectors.push(carried);
        carried = undefined;
        continue;
      }

      if (NON_DUTY_CODES.has(cell)) {
        // Sickness is recorded; days off, downroute days off and standby are not. A logbook that
        // logged every day off would be a copy of the roster, but a month's hours cannot be read
        // without knowing whether the crew member was available to fly them.
        if (LOGGED_ABSENCE_CODES.has(cell)) absences.push({ code: cell, date });

        // A day off can still carry a time pair (a downroute day off prints 00:00–23:59); step
        // over it so the pair is not mistaken for a duty.
        i += 1;
        while (i < cells.length && isPlainTime(cells[i])) i += 1;
        currentDuty = undefined;
        continue;
      }

      if (cell === DELAY_LABEL) {
        // The accumulated delay belongs to the duty, not to a sector, and the block hours the
        // report totals are already the actual times. Step over the label and its value.
        i += 1;
        if (i < cells.length && isPlainTime(cells[i])) i += 1;
        continue;
      }

      // A duty that runs past midnight leaves this glyph at the foot of its column even when its
      // last sector landed before the day ended (the crew are still on duty, downroute). The
      // sector-level use of the same glyph is consumed inside readSector; reaching it here means
      // only the duty continues, so hold it open and let tomorrow's column carry on.
      if (cell === CONTINUES_GLYPH) {
        i += 1;
        continue;
      }

      if (isFlightNumber(cell)) {
        const read = readSector(cells, i, date, currentDuty ?? openDuty());
        if (!read) {
          unreadCells.push(cell);
          i += 1;
          continue;
        }
        currentDuty!.sectorCount += 1;
        read.sector.dutySectorIndex = currentDuty!.sectorCount;
        if (read.continues) carried = read.sector;
        else sectors.push(read.sector);
        i = read.next;
        continue;
      }

      if (isPlainTime(cell)) {
        i += 1;

        // A lone time is either the report time that opens a duty or the release time that
        // closes one, and the two look identical. What separates them is what comes next: a
        // report time is followed by the flight it reports for, a release time is followed by
        // nothing, by the next duty's report time, or by a day-code.
        //
        // Position alone cannot decide it. Where a day holds two duties the roster prints
        // "release, report" as two adjacent times — but after a pure positioning duty it prints
        // no release at all, leaving a single time that is the *next* duty's report. Reading
        // that one as a release would close a duty at a time hours after it ended and leave the
        // real duty with no start.
        if (isFlightNumber(cells[i] ?? '')) {
          openDuty().start = `${date}T${cell}`;
        } else if (currentDuty) {
          currentDuty.end = `${date}T${cell}`;
          currentDuty = undefined;
        } else {
          openDuty().start = `${date}T${cell}`;
        }
        continue;
      }

      if (GROUND_DUTY_CODE_RE.test(cell) && isPlainTime(cells[i + 1] ?? '') && isPlainTime(cells[i + 2] ?? '')) {
        const duty = openDuty();
        duty.start = `${date}T${cells[i + 1]}`;
        duty.end = `${date}T${cells[i + 2]}`;
        duty.sectorCount = 1;
        groundDuties.push({
          code: cell,
          date,
          start: cells[i + 1],
          end: cells[i + 2],
          dutyIndex: duty.index,
        });
        currentDuty = undefined;
        i += 3;
        continue;
      }

      // A bare code with no times is a whole-day marker the legend defines but that carries no
      // hours (a training day with no slot, a roster note). Nothing to log, but worth reporting.
      if (GROUND_DUTY_CODE_RE.test(cell)) {
        unreadCells.push(cell);
        i += 1;
        continue;
      }

      unreadCells.push(cell);
      i += 1;
    }
  }

  return { sectors, groundDuties, absences, duties, unreadCells };
}

interface SectorRead {
  sector: RosterSector;
  next: number;
  /** True when the sector's arrival lands in a later day's column. */
  continues: boolean;
}

/**
 * Reads one sector starting at its flight-number cell.
 *
 * Cell order is fixed: flight number, departure time, departure station, then either the arrival
 * station or the "continues tomorrow" arrow. A deadhead sector is the one shape that varies — it
 * carries no aircraft type, because the crew member was a passenger on someone else's aircraft.
 */
function readSector(
  cells: string[],
  start: number,
  date: string,
  duty: RosterDuty,
): SectorRead | undefined {
  let i = start;
  const flightNumber = cells[i];
  i += 1;

  const departure = parseCellTime(cells[i] ?? '');
  if (!departure) return undefined;
  i += 1;

  const from = parseCellStation(cells[i] ?? '');
  if (!from) return undefined;
  i += 1;

  const sector: RosterSector = {
    flightNumber,
    date,
    departureAirport: from.code,
    arrivalAirport: '',
    timeOut: departure.time,
    timeIn: '',
    deadhead: from.deadhead,
    actualTimes: departure.actual,
    dutyIndex: duty.index,
    dutySectorIndex: duty.sectorCount + 1,
  };

  if (cells[i] === CONTINUES_GLYPH) {
    return { sector, next: i + 1, continues: true };
  }

  const to = parseCellStation(cells[i] ?? '');
  if (!to) return undefined;
  i += 1;

  const arrival = parseCellTime(cells[i] ?? '');
  if (!arrival) return undefined;
  i += 1;

  sector.arrivalAirport = to.code;
  sector.timeIn = arrival.time;
  sector.actualTimes = sector.actualTimes && arrival.actual;

  const aircraft = parseCellAircraft(cells[i] ?? '');
  if (aircraft) {
    sector.aircraftType = aircraft;
    i += 1;
  }

  return { sector, next: i, continues: false };
}

/** Fills in the arrival half of a sector that was carried into this column. */
function completeCarriedSector(
  sector: RosterSector,
  cells: string[],
  start: number,
  date: string,
): number {
  let i = start;

  const to = parseCellStation(cells[i] ?? '');
  if (to) {
    sector.arrivalAirport = to.code;
    i += 1;
  }

  const arrival = parseCellTime(cells[i] ?? '');
  if (arrival) {
    sector.timeIn = arrival.time;
    sector.actualTimes = sector.actualTimes && arrival.actual;
    sector.arrivalDate = date;
    i += 1;
  }

  const aircraft = parseCellAircraft(cells[i] ?? '');
  if (aircraft) {
    sector.aircraftType = aircraft;
    i += 1;
  }

  return i;
}

/** Duty length in minutes, or undefined when the roster left one end of it open. */
export function dutyMinutes(duty: RosterDuty): number | undefined {
  if (!duty.start || !duty.end) return undefined;

  const startMinutes = localDateTimeToMinutes(duty.start);
  const endMinutes = localDateTimeToMinutes(duty.end);
  if (startMinutes === undefined || endMinutes === undefined) return undefined;

  const elapsed = endMinutes - startMinutes;
  return elapsed >= 0 ? elapsed : undefined;
}

function localDateTimeToMinutes(value: string): number | undefined {
  const [date, time] = value.split('T');
  const minutes = hhmmToMinutes(time);
  if (minutes === null) return undefined;

  const [year, month, day] = date.split('-').map(Number);
  const days = Date.UTC(year, month - 1, day) / 86_400_000;
  return days * 1440 + minutes;
}
