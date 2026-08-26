import { parseDateDdMmYyyy } from '../patterns';
import { tokenizeLines } from '../tokenize';
import { ExtractedPage } from '../types';

/** Who the report is for, from the line under its title. */
export interface ReportSubject {
  /** Staff number — the key that finds this person in each flight's crew list. */
  staffId: string;
  name: string;
  /** Home base, e.g. ALA. */
  base?: string;
  /** Rank held, e.g. FJ. */
  rank?: string;
  /** Type qualification the roster records against the rank, e.g. 321L. */
  qualification?: string;
}

export interface ReportPeriod {
  /** ISO "YYYY-MM-DD". */
  start: string;
  end: string;
}

export interface ReportTotals {
  blockMinutes?: number;
  nightMinutes?: number;
}

/** "8557 SHYNYBAYEVA KHAVA ALA-FJ-321L" */
const SUBJECT_RE = /^(\d{2,6})\s+([A-Z][A-Z' -]*?)\s+([A-Z]{3})-([A-Z]{2,3})-([A-Z0-9]{2,6})$/;
/** The same line without the base-rank-qualification tail, which some variants omit. */
const SUBJECT_MINIMAL_RE = /^(\d{2,6})\s+([A-Z][A-Z' -]+)$/;

const PERIOD_RE = /(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/;

export function parseSubject(pages: ExtractedPage[]): ReportSubject | undefined {
  for (const page of pages) {
    for (const line of tokenizeLines(page)) {
      const full = SUBJECT_RE.exec(line.text.trim());
      if (full) {
        const [, staffId, name, base, rank, qualification] = full;
        return { staffId, name: name.trim(), base, rank, qualification };
      }

      const minimal = SUBJECT_MINIMAL_RE.exec(line.text.trim());
      if (minimal) return { staffId: minimal[1], name: minimal[2].trim() };
    }
  }
  return undefined;
}

export function parsePeriod(pages: ExtractedPage[]): ReportPeriod | undefined {
  for (const page of pages) {
    for (const line of tokenizeLines(page)) {
      const match = PERIOD_RE.exec(line.text);
      if (!match) continue;
      const start = parseDateDdMmYyyy(match[1]);
      const end = parseDateDdMmYyyy(match[2]);
      if (start && end) return { start, end };
    }
  }
  return undefined;
}

/**
 * The report's own "Total Hours and Statistics" block.
 *
 * These are the numbers to check the import against, and the two of them fail differently.
 * Block Hours is arithmetic on the same times the grid prints, so a correct parse should
 * reproduce it exactly — a mismatch means a sector was missed, double-counted, or converted
 * through the wrong timezone. Night Hours is not: it is the airline's contractual count under
 * its own clock rule, so it is reported for comparison, never as a target.
 */
export function parseReportTotals(pages: ExtractedPage[]): ReportTotals {
  for (const page of pages) {
    const lines = tokenizeLines(page);

    const headingIndex = lines.findIndex((line) => line.text.startsWith('Block Hours'));
    if (headingIndex === -1) continue;

    const heading = lines[headingIndex];
    const values = lines[headingIndex + 1];
    if (!values) continue;

    const blockX = heading.items.find((item) => item.str.trim().startsWith('Block'))?.x;
    const nightX = heading.items.find((item) => item.str.trim().startsWith('Night'))?.x;

    return {
      blockMinutes: minutesUnder(values, blockX),
      nightMinutes: minutesUnder(values, nightX),
    };
  }

  return {};
}

/**
 * Reads the time sitting under a heading. Positional rather than by order: the block reads as a
 * two-column table and its two values are otherwise indistinguishable from each other.
 */
function minutesUnder(
  values: { items: { str: string; x: number }[] },
  headingX: number | undefined,
): number | undefined {
  if (headingX === undefined) return undefined;

  const item = values.items
    .filter((candidate) => /^\d{1,4}:[0-5]\d$/.test(candidate.str.trim()))
    .sort((a, b) => Math.abs(a.x - headingX) - Math.abs(b.x - headingX))[0];
  if (!item) return undefined;

  // Totals run past 24 hours, so the plain HH:MM parser (which caps at 23) can't be used.
  const [hours, minutes] = item.str.trim().split(':').map(Number);
  return hours * 60 + minutes;
}
