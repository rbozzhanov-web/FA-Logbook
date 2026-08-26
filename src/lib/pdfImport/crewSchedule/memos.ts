import { parseDateDdMmYyyy } from '../patterns';
import { tokenizeLines } from '../tokenize';
import { ExtractedPage, TextItem } from '../types';

/**
 * The report's memo section: notes filed against a flight or a day.
 *
 * Worth carrying into the logbook because they are the record of *why* a sector ran the way it
 * did — a delay code, an ATC hold, a late fuelling truck. The grid shows a "M" marker where one
 * exists but not the note itself.
 */
export interface RosterMemo {
  date: string;
  /** Present when the memo is filed against a flight rather than the day as a whole. */
  flightNumber?: string;
  text: string;
}

const HEADER_DATE = 'Date';
const HEADER_CATEGORY = 'Category';
const HEADER_MEMO = 'Memo';

/** "Flight 909 - General memo" — the category cell, which names the flight when it has one. */
const FLIGHT_CATEGORY_RE = /^Flight\s+(\d{1,5})\b/;

export function extractMemos(pages: ExtractedPage[]): RosterMemo[] {
  const memos: RosterMemo[] = [];
  let inMemoSection = false;

  for (const page of pages) {
    const lines = tokenizeLines(page);

    const heading = lines.find(
      (line) =>
        line.items.some((item) => item.str.trim() === HEADER_DATE) &&
        line.items.some((item) => item.str.trim() === HEADER_CATEGORY) &&
        line.items.some((item) => item.str.trim() === HEADER_MEMO),
    );

    // The section runs over page breaks, and continuation pages repeat no heading — so once it
    // has started, later pages are read from the top until another section's heading appears.
    if (heading) inMemoSection = true;
    else if (!inMemoSection) continue;

    const columns = heading ? headingColumns(heading) : undefined;
    if (heading && !columns) continue;

    const top = heading ? heading.y : pageBodyTop(lines);
    const bottom = sectionEnd(lines, top);
    const body = page.items.filter(
      (item) => item.y > top && item.y < bottom && item.str.trim().length > 0,
    );

    const anchors = body
      .filter((item) => parseDateDdMmYyyy(item.str))
      .sort((a, b) => a.y - b.y);
    if (anchors.length === 0) continue;

    const categoryX = columns?.category ?? inferColumnX(body, anchors, 1);
    const memoX = columns?.memo ?? inferColumnX(body, anchors, 2);
    if (categoryX === undefined || memoX === undefined) continue;

    const categoryItems = body.filter((item) => item.x >= categoryX - 4 && item.x < memoX - 4);
    const memoItems = body.filter((item) => item.x >= memoX - 4);

    for (const [index, anchor] of anchors.entries()) {
      const date = parseDateDdMmYyyy(anchor.str)!;
      const category = categoryItems.find((item) => nearestAnchorIndex(anchors, item.y) === index);
      const text = memoItems
        .filter((item) => nearestAnchorIndex(anchors, item.y) === index)
        .sort((a, b) => a.y - b.y)
        .map((item) => item.str.trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!text) continue;
      const flight = category ? FLIGHT_CATEGORY_RE.exec(category.str.trim()) : null;
      memos.push({ date, flightNumber: flight?.[1], text });
    }
  }

  return memos;
}

interface MemoColumns {
  category: number;
  memo: number;
}

function headingColumns(heading: { items: TextItem[] }): MemoColumns | undefined {
  const at = (label: string) => heading.items.find((item) => item.str.trim() === label)?.x;
  const category = at(HEADER_CATEGORY);
  const memo = at(HEADER_MEMO);
  if (category === undefined || memo === undefined) return undefined;
  return { category, memo };
}

/** On a continuation page there is no heading, so the columns are taken from the rows themselves. */
function inferColumnX(body: TextItem[], anchors: TextItem[], ordinal: number): number | undefined {
  const dateX = anchors[0].x;
  const xs = [...new Set(body.filter((item) => item.x > dateX + 8).map((item) => Math.round(item.x)))].sort(
    (a, b) => a - b,
  );
  return xs[ordinal - 1];
}

/**
 * Where a continuation page's content starts.
 *
 * Every page repeats the report's title and period across the top, and the memo section runs
 * over page breaks without repeating its own heading. Reading a continuation page from y=0 pulls
 * that repeated banner into the first memo on the page, which then lands in a flight's remarks —
 * so the banner is stepped over explicitly.
 */
function pageBodyTop(lines: { y: number; text: string }[]): number {
  let bottom = 0;
  for (const line of lines) {
    if (line.y > PAGE_HEADER_MAX_Y) break;
    if (PAGE_HEADER_RE.test(line.text)) bottom = line.y;
  }
  return bottom;
}

/** The repeated banner: the report's title line and the period line beneath it. */
const PAGE_HEADER_RE = /Personal Crew Schedule Report|\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/;
/** The banner is always within the first inch of the page; nothing below that is header. */
const PAGE_HEADER_MAX_Y = 100;

/**
 * The memo table ends where the next section's heading begins — or, on the last page, where the
 * printed footer does.
 */
function sectionEnd(lines: { y: number; text: string }[], top: number): number {
  const next = lines.find(
    (line) =>
      line.y > top &&
      (line.text.startsWith('Descriptions') ||
        line.text.startsWith('Expiry Dates') ||
        line.text.startsWith('Hotel Information') ||
        line.text.startsWith('Generated on')),
  );
  return next ? next.y - 2 : Number.POSITIVE_INFINITY;
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

/** The memos filed against one sector, joined for the entry's remarks field. */
export function memosFor(memos: RosterMemo[], flightNumber: string, date: string): string | undefined {
  const matches = memos.filter(
    (memo) => memo.flightNumber === flightNumber && withinADay(memo.date, date),
  );
  if (matches.length === 0) return undefined;
  return matches.map((memo) => memo.text).join(' · ');
}

function withinADay(a: string, b: string): boolean {
  if (a === b) return true;
  const diff = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return diff <= 86_400_000;
}
