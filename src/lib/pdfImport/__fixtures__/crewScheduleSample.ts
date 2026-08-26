import { ExtractedPage, TextItem } from '../types';

/**
 * Builds a Personal Crew Schedule Report in the shape pdf.js actually produces for one.
 *
 * The geometry here is measured from a real report rather than invented: A4 landscape at 842×595
 * points, day columns 26.06pt apart starting at x=18.93, and cell rows 8.16pt apart starting at
 * y=127.55. That matters more than it looks — this parser is entirely positional, so a fixture
 * with tidy round coordinates would exercise none of the column-boundary and row-grouping
 * arithmetic that the real document demands.
 *
 * Real rosters carry names, staff numbers and hotel addresses, so they are not committed. This
 * stands in for them in the test suite; `scripts/extract-roster.mjs` generates the real thing
 * locally for the end-to-end check in `__tests__/realRoster.test.ts`.
 */

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;

const DAY_HEADING_Y = 108.85;
const WEEKDAY_Y = 118.24;
const FIRST_CELL_Y = 127.55;
const ROW_PITCH = 8.157;
const COLUMN_PITCH = 26.055;
const FIRST_COLUMN_X = 18.93;

const MEMO_MARKER_Y = 355.93;
const TOTALS_HEADING_Y = 398.31;
const TOTALS_LABEL_Y = 419.21;
const TOTALS_VALUE_Y = 435.19;
const CREW_HEADING_Y = 463.17;
const CREW_TABLE_HEADER_Y = 484.08;
const CREW_FIRST_ROW_Y = 505.2;
const CREW_ROW_PITCH = 21;

const CREW_DATE_X = 18.72;
const CREW_DUTY_X = 95.22;
const CREW_DETAILS_X = 171.71;

/**
 * The left edge of a day's column.
 *
 * Derived from the heading rather than assumed: headings are centred in their columns, so a
 * heading at x sits about (column width − heading width) / 2 in from the edge.
 */
function columnLeft(index: number): number {
  return FIRST_COLUMN_X + index * COLUMN_PITCH - (COLUMN_PITCH - textWidth('01/07')) / 2;
}

/** Cells are centred in their column too, so a wide value starts further left than a narrow one. */
function centredX(index: number, text: string): number {
  return columnLeft(index) + (COLUMN_PITCH - textWidth(text)) / 2;
}

function textWidth(text: string): number {
  // ~3.8pt per character at the report's 6pt body size, close enough that centred cells land
  // where real ones do relative to their column bounds.
  return text.length * 3.8;
}

function item(str: string, x: number, y: number): TextItem {
  return { str, x, y, width: textWidth(str) };
}

export interface DaySpec {
  /** "DD/MM" as the heading prints it. */
  day: string;
  /** Weekday abbreviation shown under the heading. */
  weekday: string;
  /** Cell values top to bottom, exactly as the roster stacks them. */
  cells: string[];
  /** Whether the day carries a memo marker on the shared marker row. */
  memo?: boolean;
}

export interface CrewRowSpec {
  /** "DD/MM/YYYY" as the crew table prints it. */
  date: string;
  flightNumber: string;
  /** Pipe-joined crew, e.g. "CP - 100 - SMITH J | FJ - DHC - 8557 - DOE A". */
  details: string;
  /** Extra lines the details cell wraps onto, which sit *above* and below the date. */
  wrapped?: string[];
}

export interface ReportSpec {
  title?: string;
  period: string;
  subject: string;
  days: DaySpec[];
  blockHours?: string;
  nightHours?: string;
  crew?: CrewRowSpec[];
}

export function buildCrewSchedulePage(spec: ReportSpec): ExtractedPage {
  const items: TextItem[] = [
    item('AIR ASTANA', 14.22, 36.01),
    item(spec.title ?? 'Personal Crew Schedule Report', 292.52, 34.04),
    item(spec.period, 274.5, 64.03),
    item(spec.subject, 17.22, 93.03),
  ];

  spec.days.forEach((day, index) => {
    const columnX = FIRST_COLUMN_X + index * COLUMN_PITCH;
    items.push(item(day.day, columnX, DAY_HEADING_Y));
    items.push(item(day.weekday, columnX + 2, WEEKDAY_Y));

    day.cells.forEach((cell, row) => {
      items.push(item(cell, centredX(index, cell), FIRST_CELL_Y + row * ROW_PITCH));
    });

    // The marker row runs across the whole grid at one fixed height, below every day's cells.
    if (day.memo) items.push(item('M', columnX + 10, MEMO_MARKER_Y));
  });

  items.push(item('Total Hours and Statistics', 17.97, TOTALS_HEADING_Y));
  if (spec.blockHours || spec.nightHours) {
    items.push(item('Block Hours', 17.97, TOTALS_LABEL_Y));
    items.push(item('Night Hours', 424.04, TOTALS_LABEL_Y));
    if (spec.blockHours) items.push(item(spec.blockHours, 17.97, TOTALS_VALUE_Y));
    if (spec.nightHours) items.push(item(spec.nightHours, 424.04, TOTALS_VALUE_Y));
  }

  if (spec.crew?.length) {
    items.push(item('Other Crew', 17.22, CREW_HEADING_Y));
    items.push(item('Date', CREW_DATE_X, CREW_TABLE_HEADER_Y));
    items.push(item('Duty', CREW_DUTY_X, CREW_TABLE_HEADER_Y));
    items.push(item('Details', CREW_DETAILS_X, CREW_TABLE_HEADER_Y));

    spec.crew.forEach((row, index) => {
      const y = CREW_FIRST_ROW_Y + index * CREW_ROW_PITCH;
      items.push(item(row.date, CREW_DATE_X, y));
      items.push(item(row.flightNumber, CREW_DUTY_X, y));
      // A wrapped details cell is vertically centred against its date, so its first line sits
      // *above* the date it belongs to — the case that breaks naive top-down row grouping.
      items.push(item(row.details, CREW_DETAILS_X, y - 5.15));
      row.wrapped?.forEach((line, wrapIndex) => {
        items.push(item(line, CREW_DETAILS_X, y + 5.15 * (wrapIndex + 1)));
      });
    });
  }

  items.push(item('Generated on  Aug 26, 2026 09:03', 14.22, 569.4));
  items.push(item('Page 1 of 1', 743.84, 569.4));

  return { items, width: PAGE_WIDTH, height: PAGE_HEIGHT };
}
