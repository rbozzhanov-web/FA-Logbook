import { calculateDayNight } from '@/src/lib/daynight/nightCalc';
import { isKnownAirport } from '@/src/lib/daynight/airportDb';
import { hhmmToMinutes } from '@/src/lib/time';
import { CabinCrewLogEntry, NEW_ENTRY_DEFAULTS } from '@/src/types/logbook';
import { RosterDuty, RosterGroundDuty, RosterSector, readRoster } from '../../crewSchedule/duties';
import { parsePeriod, parseReportTotals, parseSubject } from '../../crewSchedule/header';
import { DayColumn, extractDayColumns } from '../../crewSchedule/grid';
import { extractMemos, memosFor } from '../../crewSchedule/memos';
import { CrewMember, extractCrewRecords, lookupCrew } from '../../crewSchedule/otherCrew';
import { tokenizeLines } from '../../tokenize';
import { CrossCheck, ExtractedPage, ParsedCandidate, ParseResult, ParserRule } from '../../types';

/**
 * Air Astana's "Personal Crew Schedule Report" — the roster a cabin crew member downloads.
 *
 * A different document from the flight-time report a pilot files against, and it has to be read
 * differently: it is a month-wide calendar grid rather than a list of flights, its times are
 * station-local rather than Zulu, it carries no tail numbers, and it marks positioning sectors
 * that must not be counted as flown hours. The pieces of that live in ../../crewSchedule/;
 * this file turns what they read into logbook entries.
 */

export const AIR_ASTANA_CREW_SCHEDULE_RULE_ID = 'air-astana-personal-crew-schedule-v1';

export const airAstanaCrewScheduleRule: ParserRule = {
  id: AIR_ASTANA_CREW_SCHEDULE_RULE_ID,

  matches(pages: ExtractedPage[]): boolean {
    const text = documentText(pages);
    return text.includes('AIR ASTANA') && text.includes('Personal Crew Schedule Report');
  },

  parse(pages: ExtractedPage[]): ParseResult {
    const period = parsePeriod(pages);
    const subject = parseSubject(pages);

    if (!period) {
      return {
        ruleId: this.id,
        candidates: [],
        crossChecks: [],
        subject: subject && { ...subject },
      };
    }

    const columns = pages.flatMap((page) => {
      const grid = extractDayColumns(page);
      return grid.found ? grid.columns : [];
    });

    const roster = readRoster(dedupeColumns(columns), period.start, period.end);
    const crewRecords = extractCrewRecords(pages);
    const memos = extractMemos(pages);

    const candidates: ParsedCandidate[] = [];

    for (const sector of roster.sectors) {
      candidates.push(
        buildSectorCandidate(sector, roster.duties[sector.dutyIndex], {
          crewRecords,
          memos,
          ownStaffId: subject?.staffId,
          ownRank: subject?.rank,
        }),
      );
    }

    for (const ground of roster.groundDuties) {
      candidates.push(buildGroundCandidate(ground, subject?.base, subject?.rank));
    }

    candidates.sort(byDateThenTime);

    return {
      ruleId: this.id,
      candidates,
      crossChecks: buildCrossChecks(pages, candidates),
      subject: subject && { ...subject, periodStart: period.start, periodEnd: period.end },
    };
  },
};

function documentText(pages: ExtractedPage[]): string {
  return pages
    .map((page) => tokenizeLines(page).map((line) => line.text).join('\n'))
    .join('\n');
}

/**
 * A multi-page roster repeats the whole grid on every page, so the same day arrives once per
 * page. Keeping the richest copy of each day rather than the first: a page can carry the grid
 * with its cells clipped away, and an empty column would otherwise erase a real duty.
 */
function dedupeColumns(columns: DayColumn[]): DayColumn[] {
  const byLabel = new Map<string, DayColumn>();
  const order: string[] = [];

  for (const column of columns) {
    const existing = byLabel.get(column.label);
    if (!existing) {
      byLabel.set(column.label, column);
      order.push(column.label);
    } else if (column.cells.length > existing.cells.length) {
      byLabel.set(column.label, column);
    }
  }

  return order.map((label) => byLabel.get(label)!);
}

interface SectorContext {
  crewRecords: ReturnType<typeof extractCrewRecords>;
  memos: ReturnType<typeof extractMemos>;
  ownStaffId?: string;
  ownRank?: string;
}

function buildSectorCandidate(
  sector: RosterSector,
  duty: RosterDuty | undefined,
  context: SectorContext,
): ParsedCandidate {
  const unmatchedFields: string[] = [];
  const raw = describeSector(sector);

  const crew = lookupCrew(context.crewRecords, sector.flightNumber, sector.date, context.ownStaffId);
  const own = crew?.own;

  // The grid's asterisk and the crew list's DHC tag say the same thing from two places. Either
  // one is enough to treat the sector as positioning; both agreeing is the normal case.
  const deadhead = sector.deadhead || own?.deadhead === true;
  if (sector.deadhead !== (own?.deadhead === true) && own) {
    unmatchedFields.push(
      'The roster grid and the crew list disagree about whether this sector was flown as a passenger — check it.',
    );
  }

  const fields: Partial<CabinCrewLogEntry> = {
    ...NEW_ENTRY_DEFAULTS,
    date: sector.date,
    kind: deadhead ? 'deadhead' : 'operating',
    flightNumber: sector.flightNumber,
    departureAirport: sector.departureAirport,
    arrivalAirport: sector.arrivalAirport,
    aircraftType: sector.aircraftType,
    timeOut: sector.timeOut,
    timeIn: sector.timeIn,
    arrivalDate: sector.arrivalDate,
    position: own?.rank ?? context.ownRank,
    captainName: crew?.captain?.name,
    purserName: crew?.purser?.name,
    otherCrewNames: formatOtherCrew(crew?.others),
    remarks: memosFor(context.memos, sector.flightNumber, sector.date),
    source: 'pdf_import',
  };

  if (!sector.arrivalAirport || !sector.timeIn) {
    unmatchedFields.push(
      'This sector has no arrival on the roster — it may run past the end of the report. Fill in where and when it landed.',
    );
    return { fields, rawSourceLine: raw, confidence: 'low', unmatchedFields };
  }

  for (const code of [sector.departureAirport, sector.arrivalAirport]) {
    if (!isKnownAirport(code)) {
      unmatchedFields.push(
        `Airport "${code}" is not in the database, so its timezone is unknown and hours can't be computed for it.`,
      );
    }
  }

  const daynight = calculateDayNight({
    date: sector.date,
    departureAirport: sector.departureAirport,
    arrivalAirport: sector.arrivalAirport,
    timeOut: sector.timeOut,
    timeIn: sector.timeIn,
    arrivalDate: sector.arrivalDate,
  });

  if (!daynight) {
    unmatchedFields.push(
      'Block time and night hours could not be computed — check the stations, the date and the times.',
    );
    return { fields, rawSourceLine: raw, confidence: 'low', unmatchedFields };
  }

  fields.arrivalDate = daynight.arrivalDate === sector.date ? undefined : daynight.arrivalDate;
  fields.dayMinutes = daynight.dayMinutes;
  fields.nightMinutes = daynight.nightMinutes;
  if (deadhead) fields.deadheadMinutes = daynight.blockMinutes;
  else fields.blockMinutes = daynight.blockMinutes;

  applyDuty(fields, duty, sector);

  if (duty && (!duty.start || !duty.end)) {
    unmatchedFields.push(
      'The roster does not show both ends of this duty, so its duty hours cannot be counted. Fill in the report and release times if you need them.',
    );
  }

  if (!sector.actualTimes) {
    unmatchedFields.push(
      'The roster printed a scheduled time rather than an actual one for this sector, so its hours are planned, not flown.',
    );
  }

  return {
    fields,
    rawSourceLine: raw,
    confidence: unmatchedFields.length === 0 ? 'high' : 'medium',
    unmatchedFields,
  };
}

function buildGroundCandidate(
  ground: RosterGroundDuty,
  base: string | undefined,
  rank: string | undefined,
): ParsedCandidate {
  const start = hhmmToMinutes(ground.start);
  const end = hhmmToMinutes(ground.end);
  const minutes = start !== null && end !== null && end >= start ? end - start : 0;

  const unmatchedFields: string[] = [];
  if (!base) {
    unmatchedFields.push('The report does not say where this ground duty took place — set the station.');
  }
  if (minutes === 0) {
    unmatchedFields.push('This ground duty has no usable start and end time — check its hours.');
  }

  return {
    fields: {
      ...NEW_ENTRY_DEFAULTS,
      date: ground.date,
      kind: 'ground',
      departureAirport: base ?? '',
      arrivalAirport: base ?? '',
      timeOut: ground.start,
      timeIn: ground.end,
      groundDutyMinutes: minutes,
      dutyCode: ground.code,
      position: rank,
      dutyStart: `${ground.date}T${ground.start}`,
      dutyEnd: `${ground.date}T${ground.end}`,
      dutySectorIndex: 1,
      dutySectorCount: 1,
      source: 'pdf_import',
    },
    rawSourceLine: `${ground.date} ${ground.code} ${ground.start}-${ground.end}`,
    confidence: unmatchedFields.length === 0 ? 'high' : 'medium',
    unmatchedFields,
  };
}

/**
 * Attaches the duty a sector belongs to.
 *
 * The duty is carried on every one of its sectors, numbered, so the totals can count duty hours
 * once per duty rather than once per sector — a three-sector day is one duty, and summing it
 * three times would inflate duty time threefold.
 */
function applyDuty(
  fields: Partial<CabinCrewLogEntry>,
  duty: RosterDuty | undefined,
  sector: RosterSector,
): void {
  if (!duty) return;

  fields.dutyStart = duty.start;
  fields.dutyEnd = duty.end;
  fields.dutySectorCount = duty.sectorCount;
  fields.dutySectorIndex = sector.dutySectorIndex;
}

function formatOtherCrew(members: CrewMember[] | undefined): string | undefined {
  if (!members || members.length === 0) return undefined;
  return members
    .map((member) => `${member.rank}${member.deadhead ? ' (DHC)' : ''} ${member.name}`)
    .join(', ');
}

function describeSector(sector: RosterSector): string {
  const route = `${sector.deadhead ? '*' : ''}${sector.departureAirport} → ${sector.arrivalAirport || '?'}`;
  return `${sector.date} ${sector.flightNumber} ${route} ${sector.timeOut}–${sector.timeIn || '?'}`;
}

function byDateThenTime(a: ParsedCandidate, b: ParsedCandidate): number {
  const dateA = a.fields.date ?? '';
  const dateB = b.fields.date ?? '';
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  return (a.fields.timeOut ?? '') < (b.fields.timeOut ?? '') ? -1 : 1;
}

/**
 * Checks the import against the report's own totals.
 *
 * Block Hours is a genuine oracle: it is arithmetic over the same times the grid prints, so a
 * correct parse reproduces it to the minute. It catches a missed sector, a double-counted one, a
 * mis-read arrow across midnight, and — the failure this format invites most — a timezone
 * conversion gone wrong, since two stations' offsets are the difference between a sector's clock
 * times and its real length.
 *
 * Night Hours is not an oracle and is reported as a comparison. The report states the airline's
 * contractual night count, computed under its own clock rule; ours is the sun's actual position
 * over the route. They answer different questions and should not be expected to agree.
 */
function buildCrossChecks(pages: ExtractedPage[], candidates: ParsedCandidate[]): CrossCheck[] {
  const totals = parseReportTotals(pages);
  const checks: CrossCheck[] = [];

  const parsedBlock = candidates.reduce((sum, c) => sum + (c.fields.blockMinutes ?? 0), 0);
  if (totals.blockMinutes !== undefined) {
    checks.push({
      label: 'Block hours',
      parsedTotalMinutes: parsedBlock,
      reportedTotalMinutes: totals.blockMinutes,
      matches: parsedBlock === totals.blockMinutes,
      note: 'Operating sectors only — positioning is excluded, as it is in the report.',
    });
  }

  const parsedNight = candidates.reduce(
    (sum, c) => sum + (c.fields.kind === 'operating' ? c.fields.nightMinutes ?? 0 : 0),
    0,
  );
  if (totals.nightMinutes !== undefined) {
    checks.push({
      label: 'Night hours',
      parsedTotalMinutes: parsedNight,
      reportedTotalMinutes: totals.nightMinutes,
      matches: true,
      informational: true,
      note: "Computed from the sun's real position; the report states the airline's own contractual count, so the two differ by design.",
    });
  }

  return checks;
}
