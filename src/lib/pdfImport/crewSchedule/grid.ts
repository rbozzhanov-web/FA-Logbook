import { DAY_DDMM_RE } from '../patterns';
import { Line, tokenizeLines } from '../tokenize';
import { ExtractedPage, TextItem } from '../types';

/**
 * The roster is a calendar grid, not a table of rows.
 *
 * Every other airline document this app has met prints one flight per line, so a line-based
 * tokenizer reads it. A crew schedule prints one *day* per column: the month runs left to right
 * across the page, and a day's duty runs top to bottom inside its column, a single value to a
 * cell. Reading it by line yields fragments of thirty-one unrelated days interleaved, which is
 * why this rule works down columns instead.
 */

export interface DayColumn {
  /** The "DD/MM" heading as printed. */
  label: string;
  /** Cell values in the column, in top-to-bottom order. */
  cells: string[];
}

/** A memo marker sits on its own row across the whole grid; it flags a note, not a value. */
const MEMO_MARKER = 'M';

/**
 * Rows below this belong to the report's later sections (totals, crew lists, memos), whose own
 * columns overlap the grid's x-ranges and would otherwise be read as extra cells.
 */
const GRID_END_MARKERS = ['Total Hours', 'Other Crew', 'Expiry Dates'];

export interface GridExtraction {
  columns: DayColumn[];
  /** Present only when the page actually carries a grid. */
  found: boolean;
}

/**
 * Finds the day-heading row and slices the page into one column per day.
 *
 * Column bounds come from the headings themselves rather than from any fixed geometry: each
 * column runs from just left of its own heading to just left of the next one. The headings are
 * centred in their columns and the cells beneath them are too, so a half-gap of padding on the
 * left edge keeps a wide cell (`A06:56` is wider than `03/07`) inside its own column.
 */
export function extractDayColumns(page: ExtractedPage): GridExtraction {
  const lines = tokenizeLines(page);

  const headingLine = lines.find((line) => countDayHeadings(line) >= 3);
  if (!headingLine) return { columns: [], found: false };

  const headings = headingLine.items
    .filter((item) => DAY_DDMM_RE.test(item.str.trim()))
    .sort((a, b) => a.x - b.x);

  // The weekday row ("Wed", "Thu") sits between the headings and the first cell; start below it.
  const gridTop = headingLine.y + 12;
  const gridBottom = findGridBottom(lines, gridTop);

  const pitch = headings.length > 1 ? headings[1].x - headings[0].x : page.width;
  const leftPad = pitch / 4;

  const body = page.items.filter(
    (item) =>
      item.str.trim().length > 0 &&
      item.str.trim() !== MEMO_MARKER &&
      item.y > gridTop &&
      item.y < gridBottom,
  );

  const columns = headings.map((heading, index) => {
    const nextX = headings[index + 1]?.x ?? Number.POSITIVE_INFINITY;
    const from = heading.x - leftPad;
    const to = nextX - leftPad;

    const cells = body
      .filter((item) => item.x >= from && item.x < to)
      .sort(byReadingOrder)
      .map((item) => item.str.trim());

    return { label: heading.str.trim(), cells };
  });

  return { columns, found: true };
}

function countDayHeadings(line: Line): number {
  return line.items.filter((item) => DAY_DDMM_RE.test(item.str.trim())).length;
}

function byReadingOrder(a: TextItem, b: TextItem): number {
  if (Math.abs(a.y - b.y) > 1.5) return a.y - b.y;
  return a.x - b.x;
}

function findGridBottom(lines: Line[], gridTop: number): number {
  const marker = lines.find(
    (line) => line.y > gridTop && GRID_END_MARKERS.some((text) => line.text.startsWith(text)),
  );
  return marker ? marker.y - 2 : Number.POSITIVE_INFINITY;
}

/**
 * Expands a "DD/MM" heading into a full ISO date, using the report's stated period to supply the
 * year.
 *
 * The year is never printed in the grid, and a period can straddle New Year — a December-to-
 * January roster has both years' days sitting side by side under headings that look identical.
 * So each candidate year from the period is tried and the one that lands inside it wins, with a
 * day's grace at the end for a duty that finishes after the period closes.
 */
export function resolveGridDate(label: string, periodStart: string, periodEnd: string): string | undefined {
  const match = DAY_DDMM_RE.exec(label);
  if (!match) return undefined;
  const [, dd, mm] = match;

  const years = new Set([periodStart.slice(0, 4), periodEnd.slice(0, 4)]);
  const endPlusOne = addDays(periodEnd, 1);

  for (const year of years) {
    const candidate = `${year}-${mm}-${dd}`;
    if (!isRealDate(candidate)) continue;
    if (candidate >= periodStart && candidate <= endPlusOne) return candidate;
  }

  return undefined;
}

function isRealDate(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}
