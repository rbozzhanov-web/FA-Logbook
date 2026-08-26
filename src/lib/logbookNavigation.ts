import { MonthSection, isYearDivider } from './groupEntries';
import { CabinCrewLogEntry } from '@/src/types/logbook';

/**
 * The years the logbook actually covers, newest first.
 *
 * Derived from the entries rather than from a fixed range: a logbook that starts in 2018 should
 * not offer 2015, and one that gains a 2027 flight should offer it without a code change.
 */
export function listYears(entries: CabinCrewLogEntry[]): string[] {
  const years = new Set<string>();
  for (const entry of entries) years.add(entry.date.slice(0, 4));
  return [...years].sort().reverse();
}

/** `undefined` means "every year" — the unfiltered logbook. */
export type YearFilter = string | undefined;

export function filterByYear(entries: CabinCrewLogEntry[], year: YearFilter): CabinCrewLogEntry[] {
  if (!year) return entries;
  return entries.filter((entry) => entry.date.startsWith(year));
}

export interface EntryLocation {
  sectionIndex: number;
  /**
   * Position within `section.data`. NOT a SectionList `itemIndex`: that counts the section header
   * as 0, so the caller scrolling to this row must pass `rowIndex + 1`.
   */
  rowIndex: number;
}

/**
 * Finds the entry to scroll to for a picked date.
 *
 * Prefers the closest entry **on or before** the date — asked for "1 May", someone means "the
 * part of the logbook around then", and landing on the flight that had already happened reads
 * more naturally than jumping forward past it. Only when the date precedes the whole logbook does
 * it fall back to the closest flight after it.
 *
 * Year dividers are skipped: they are layout rows, not flights, and scrolling to one would park
 * the list on a rule with no entry under it.
 */
export function findNearestEntry(
  sections: MonthSection[],
  targetDate: string,
): EntryLocation | undefined {
  let onOrBefore: { location: EntryLocation; date: string } | undefined;
  let after: { location: EntryLocation; date: string } | undefined;

  sections.forEach((section, sectionIndex) => {
    section.data.forEach((row, rowIndex) => {
      if (isYearDivider(row)) return;
      const location = { sectionIndex, rowIndex };

      if (row.date <= targetDate) {
        if (!onOrBefore || row.date > onOrBefore.date) onOrBefore = { location, date: row.date };
      } else if (!after || row.date < after.date) {
        after = { location, date: row.date };
      }
    });
  });

  return (onOrBefore ?? after)?.location;
}
