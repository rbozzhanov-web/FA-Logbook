import { CabinCrewLogEntry } from '@/src/types/logbook';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface YearHeader {
  year: string;
  /** Operating block time. Deadhead and ground duty are counted apart, as the airline counts them. */
  totalMinutes: number;
  sectorCount: number;
}

/**
 * A year divider, carried as the first row of its section's data rather than inside the section
 * header: SectionList pins the entire header when sticky headers are on, and pinning a tall
 * year+month block would eat the screen. Keeping only the month bar in the header means only it
 * sticks.
 */
export interface YearDividerRow {
  kind: 'year-divider';
  id: string;
  yearHeader: YearHeader;
}

export type MonthRow = YearDividerRow | CabinCrewLogEntry;

export function isYearDivider(row: MonthRow): row is YearDividerRow {
  return (row as YearDividerRow).kind === 'year-divider';
}

export interface MonthSection {
  /** "YYYY-MM" — stable key for SectionList. */
  key: string;
  /** e.g. "August 2026". */
  monthLabel: string;
  totalMinutes: number;
  /** Operating sectors only — a deadhead or a ground duty is listed but is not a sector worked. */
  sectorCount: number;
  data: MonthRow[];
  /**
   * Set only on the newest section: the divider for the most recent year, which has no preceding
   * month to hang off and is rendered as the list's header instead.
   */
  leadingYearHeader?: YearHeader;
}



/**
 * Groups entries into month sections, newest first, annotating the first section of each year
 * with that year's totals.
 *
 * Input order is preserved rather than re-sorted: listEntries() already returns
 * `date desc, timeOut desc`, and re-sorting here would silently diverge from it.
 *
 * Months are derived from the "YYYY-MM-DD" string directly, never parsed through Date — a
 * Date round-trip would apply the device timezone and could shift an entry into the wrong month.
 */
export function groupEntriesByMonth(entries: CabinCrewLogEntry[]): MonthSection[] {
  const sections: MonthSection[] = [];
  const byKey = new Map<string, MonthSection>();

  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    let section = byKey.get(key);

    if (!section) {
      const [year, month] = key.split('-');
      const monthName = MONTH_NAMES[Number(month) - 1] ?? month;
      section = {
        key,
        monthLabel: `${monthName} ${year}`,
        totalMinutes: 0,
        sectorCount: 0,
        data: [],
      };
      byKey.set(key, section);
      sections.push(section);
    }

    section.data.push(entry);
    // A month header reads "3 · 12:40": sectors worked, and the block time they came to. A
    // deadhead or a ground duty appears in the list but is neither, so counting it here would
    // make the header disagree with the totals screen.
    if (entry.kind === 'operating') section.sectorCount += 1;
    section.totalMinutes += entry.blockMinutes;
  }

  annotateYearHeaders(sections);
  return sections;
}

/**
 * Places a year divider ahead of each year's first month.
 *
 * A divider has to *introduce* its year, so it can't live in the section it belongs to — a
 * section header renders above its own rows, which would print "May 2018" and then "2018". So
 * each divider is appended to the end of the preceding (newer) month instead, and the newest
 * year — which has no preceding month — is handed to the list as its header.
 */
function annotateYearHeaders(sections: MonthSection[]): void {
  const yearTotals = new Map<string, { totalMinutes: number; sectorCount: number }>();

  for (const section of sections) {
    const year = section.key.slice(0, 4);
    const totals = yearTotals.get(year) ?? { totalMinutes: 0, sectorCount: 0 };
    totals.totalMinutes += section.totalMinutes;
    totals.sectorCount += section.sectorCount;
    yearTotals.set(year, totals);
  }

  const divider = (year: string): YearDividerRow => ({
    kind: 'year-divider',
    id: `year-${year}`,
    yearHeader: { year, ...yearTotals.get(year)! },
  });

  sections.forEach((section, index) => {
    const year = section.key.slice(0, 4);

    if (index === 0) {
      section.leadingYearHeader = divider(year).yearHeader;
      return;
    }

    const previousYear = sections[index - 1].key.slice(0, 4);
    if (year !== previousYear) sections[index - 1].data.push(divider(year));
  });
}
