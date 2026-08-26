import { parseDateDdMmYyyy } from '../patterns';
import { Line, tokenizeLines } from '../tokenize';
import { ExtractedPage, TextItem } from '../types';

/**
 * The "Other Crew" table: for each flight, who else was aboard and in what rank.
 *
 * Two things in it matter to the logbook. The crew member's own entry gives the rank they
 * operated in — the grid never states it — and whether they were tagged DHC, travelling as a
 * passenger. That tag is the second, independent witness to a deadhead sector: the grid marks
 * the same thing with an asterisk on the departure station, and the airline's own Block Hours
 * total agrees with both by leaving the sector out.
 */

export interface CrewMember {
  /** Rank code as the report writes it: CP, FO, IS, PU, FJ, FY, PS. */
  rank: string;
  /** Staff number. */
  id: string;
  name: string;
  /** True when the report tagged this person deadhead crew on this flight. */
  deadhead: boolean;
}

export interface CrewRecord {
  /** ISO date as the crew table states it. */
  date: string;
  flightNumber: string;
  members: CrewMember[];
}

const HEADER_DATE = 'Date';
const HEADER_DUTY = 'Duty';
const HEADER_DETAILS = 'Details';

/**
 * One crew member inside a details cell.
 *
 * The report writes them pipe-separated as "FJ - 8557 - SHYNYBAYEVA KHAVA", inserting an extra
 * "- DHC" segment for anyone positioning: "FJ - DHC - 8557 - SHYNYBAYEVA KHAVA". Names can carry
 * a doubled space where a middle name was blank, so whitespace is collapsed rather than trusted.
 */
const CREW_MEMBER_RE = /^([A-Z]{2,3})\s*-\s*(DHC\s*-\s*)?(\d{1,6})\s*-\s*(.+)$/;

export function parseCrewMember(raw: string): CrewMember | undefined {
  const match = CREW_MEMBER_RE.exec(raw.trim());
  if (!match) return undefined;
  const [, rank, dhc, id, name] = match;
  return {
    rank,
    id,
    name: name.replace(/\s+/g, ' ').trim(),
    deadhead: dhc !== undefined,
  };
}

export function parseCrewDetails(details: string): CrewMember[] {
  return details
    .split('|')
    .map((part) => parseCrewMember(part))
    .filter((member): member is CrewMember => member !== undefined);
}

/**
 * Reads the crew table across every page it spans.
 *
 * The table's three columns are found from its own heading row rather than assumed, and each
 * record's details are gathered by nearest date: a details cell wraps to two or three lines and
 * is centred against its date, so its lines sit both above and below the date they belong to.
 * Assigning each line to the closest date reads that correctly without modelling row heights.
 */
export function extractCrewRecords(pages: ExtractedPage[]): CrewRecord[] {
  const records: CrewRecord[] = [];

  for (const page of pages) {
    const lines = tokenizeLines(page);
    const heading = lines.find(
      (line) =>
        line.items.some((item) => item.str.trim() === HEADER_DATE) &&
        line.items.some((item) => item.str.trim() === HEADER_DUTY) &&
        line.items.some((item) => item.str.trim() === HEADER_DETAILS),
    );
    if (!heading) continue;

    const columns = headingColumns(heading);
    if (!columns) continue;

    const below = page.items.filter((item) => item.y > heading.y && item.str.trim().length > 0);
    const anchors = below
      .filter((item) => nearColumn(item, columns.date, columns.duty) && parseDateDdMmYyyy(item.str))
      .sort((a, b) => a.y - b.y);
    if (anchors.length === 0) continue;

    const dutyItems = below.filter((item) => nearColumn(item, columns.duty, columns.details));
    const detailItems = below.filter((item) => item.x >= columns.details - 4);

    for (const [index, anchor] of anchors.entries()) {
      const date = parseDateDdMmYyyy(anchor.str)!;
      const duty = nearestBy(dutyItems, anchor.y);
      const details = detailItems
        .filter((item) => nearestAnchorIndex(anchors, item.y) === index)
        .sort((a, b) => a.y - b.y)
        .map((item) => item.str.trim())
        .join(' ');

      if (!duty) continue;
      records.push({ date, flightNumber: duty.str.trim(), members: parseCrewDetails(details) });
    }
  }

  return records;
}

interface CrewColumns {
  date: number;
  duty: number;
  details: number;
}

function headingColumns(heading: Line): CrewColumns | undefined {
  const at = (label: string) => heading.items.find((item) => item.str.trim() === label)?.x;
  const date = at(HEADER_DATE);
  const duty = at(HEADER_DUTY);
  const details = at(HEADER_DETAILS);
  if (date === undefined || duty === undefined || details === undefined) return undefined;
  return { date, duty, details };
}

function nearColumn(item: TextItem, from: number, to: number): boolean {
  return item.x >= from - 4 && item.x < to - 4;
}

function nearestBy(items: TextItem[], y: number): TextItem | undefined {
  let best: TextItem | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const distance = Math.abs(item.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }
  return best;
}

function nearestAnchorIndex(anchors: TextItem[], y: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, anchor] of anchors.entries()) {
    const distance = Math.abs(anchor.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

export interface CrewLookup {
  /** The crew member this report belongs to, matched by staff number. */
  own?: CrewMember;
  captain?: CrewMember;
  purser?: CrewMember;
  others: CrewMember[];
}

/** The rank that runs the cabin. Kept apart from the rest, as it is on the crew list itself. */
const PURSER_RANK = 'PU';
const CAPTAIN_RANK = 'CP';

/**
 * Finds the crew record for a sector and splits it into the roles the logbook records.
 *
 * Matched by flight number and date, allowing a day either side. The crew table dates a flight
 * by its departure in UTC while the grid dates it in station time, so an evening departure from
 * Almaty sits under one date in the grid and the previous date in the crew table — the same
 * flight, an hour of timezone apart.
 */
export function lookupCrew(
  records: CrewRecord[],
  flightNumber: string,
  date: string,
  ownStaffId: string | undefined,
): CrewLookup | undefined {
  const match = records.find(
    (record) => record.flightNumber === flightNumber && withinADay(record.date, date),
  );
  if (!match) return undefined;

  const own = ownStaffId
    ? match.members.find((member) => member.id === ownStaffId)
    : undefined;

  return {
    own,
    captain: match.members.find((member) => member.rank === CAPTAIN_RANK && !member.deadhead),
    purser: match.members.find((member) => member.rank === PURSER_RANK && !member.deadhead),
    others: match.members.filter((member) => member !== own),
  };
}

function withinADay(a: string, b: string): boolean {
  if (a === b) return true;
  const diff = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return diff <= 86_400_000;
}
