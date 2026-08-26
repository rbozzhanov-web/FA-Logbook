import {
  DEFAULT_NIGHT_WINDOW,
  NightWindow,
  describeNightWindow,
} from '@/src/lib/daynight/nightWindow';
import { groupEntriesByMonth, isYearDivider } from '@/src/lib/groupEntries';
import {
  BAND_LOWER_HOURS,
  BAND_UPPER_HOURS,
  MonthTotals,
  bandTotals,
  monthlyTotals,
} from '@/src/lib/monthlyTotals';
import { LogbookSummary, entryDutyMinutes, isFirstSectorOfDuty, summarise } from '@/src/lib/summary';
import { minutesToHHMM } from '@/src/lib/time';
import { BRAND } from '@/src/theme/brand';
import { CabinCrewLogEntry } from '@/src/types/logbook';

/**
 * Escapes text that came from a roster or from typing before it is interpolated into the printed
 * logbook. A stray `&` in a remark should print as `&`, not truncate the document.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cell(value: string | number | undefined, className = ''): string {
  const text = value === undefined || value === '' ? '' : escapeHtml(String(value));
  return `<td class="${className}">${text}</td>`;
}

/** Minutes render as blank rather than "00:00" so a column of zeroes doesn't drown the real times. */
function time(minutes: number): string {
  return minutes > 0 ? minutesToHHMM(minutes) : '';
}

const COLUMNS = [
  'Date',
  'Flight',
  'From',
  'To',
  'Type',
  'Out',
  'In',
  'Block',
  'DH',
  'Day',
  'Night',
  'Rank',
  'Duty',
  'Captain',
  'Purser',
];

function entryRow(entry: CabinCrewLogEntry): string {
  const isAbsence = entry.kind === 'absence';
  const isGround = entry.kind === 'ground' || isAbsence;
  const isDeadhead = entry.kind === 'deadhead';

  // Duty hours print against the first sector of their duty only, matching how they are totalled.
  const duty = isFirstSectorOfDuty(entry) ? entryDutyMinutes(entry) : undefined;

  return `<tr class="${isAbsence ? 'absence' : isGround ? 'ground' : isDeadhead ? 'deadhead' : ''}">
    ${cell(entry.date, 'nowrap')}
    ${cell(isGround ? entry.dutyCode ?? 'GND' : entry.flightNumber)}
    ${cell(isAbsence ? '' : entry.departureAirport)}
    ${cell(isGround ? '' : entry.arrivalAirport)}
    ${cell(isGround ? '' : entry.aircraftType)}
    ${cell(isAbsence ? '' : entry.timeOut, 'num')}
    ${cell(entry.arrivalDate ? `${entry.timeIn ?? ''}⁺` : entry.timeIn, 'num')}
    ${cell(time(entry.blockMinutes), 'num')}
    ${cell(time(entry.deadheadMinutes), 'num')}
    ${cell(time(entry.dayMinutes), 'num')}
    ${cell(time(entry.nightMinutes), 'num')}
    ${cell(entry.position)}
    ${cell(duty !== undefined ? minutesToHHMM(duty) : '', 'num')}
    ${cell(isGround ? '' : entry.captainName)}
    ${cell(isGround ? '' : entry.purserName)}
  </tr>`;
}

/**
 * A printable logbook: the same month sections and year totals the app shows on screen, laid out
 * for A4 landscape. This is the "show someone" document — restoring onto a new device goes
 * through the JSON backup instead.
 *
 * Its totals come from the very rows being printed, through the same `summarise` the Totals
 * screen uses, so the summary can never disagree with the table above it — the failure that
 * would matter most in a document handed to someone else.
 */
export function buildLogbookHtml(
  entries: CabinCrewLogEntry[],
  options: { generatedAt?: Date; nightWindow?: NightWindow } = {},
): string {
  const generatedAt = options.generatedAt ?? new Date();
  const nightWindow = options.nightWindow ?? DEFAULT_NIGHT_WINDOW;

  const sections = groupEntriesByMonth(entries);
  const totals = summarise(entries, nightWindow);
  const months = monthlyTotals(entries, nightWindow);

  const body = sections
    .map((section) => {
      const rows = section.data
        .map((row) => (isYearDivider(row) ? yearRow(row.yearHeader) : entryRow(row)))
        .join('\n');

      return `<tr class="month"><td colspan="${COLUMNS.length}">${escapeHtml(section.monthLabel)}
        <span class="month-total">${section.sectorCount} · ${minutesToHHMM(section.totalMinutes)}</span>
      </td></tr>\n${rows}`;
    })
    .join('\n');

  const leadingYear = sections[0]?.leadingYearHeader;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Cabin Crew Logbook</title>
<style>
  @page { margin: 12mm; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: ${BRAND.navy}; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; letter-spacing: 0.5px; }
  .subtitle { font-size: 10px; color: #5A6577; margin: 0 0 12px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  /* A real logbook runs to many pages: repeat the column headings on each one, and never split an
     entry or a month heading across a page break. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  tr.month td, tr.year td { break-after: avoid; page-break-after: avoid; }
  th { background: ${BRAND.navy}; color: #fff; text-align: left; padding: 5px 4px; font-weight: 600; }
  td { padding: 3px 4px; border-bottom: 0.5px solid #D8DEE7; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.nowrap { white-space: nowrap; }
  tr.month td { background: #EEF1F6; font-weight: 700; padding: 5px 4px; }
  tr.month .month-total { float: right; font-weight: 600; color: #5A6577; }
  tr.year td { background: #fff; border-bottom: 1.5px solid ${BRAND.gold}; font-size: 12px; font-weight: 800; padding: 10px 4px 4px; }
  tr.deadhead td, tr.ground td, tr.absence td { color: #5A6577; font-style: italic; }
  .totals { break-inside: avoid; page-break-inside: avoid; margin-top: 14px; border-top: 2px solid ${BRAND.gold}; padding-top: 8px; font-size: 11px; }
  .totals dl { display: flex; flex-wrap: wrap; margin: 0; gap: 4px 22px; }
  .totals div { min-width: 90px; }
  .totals dt { font-size: 9px; color: #5A6577; text-transform: uppercase; letter-spacing: 0.4px; }
  .totals dd { margin: 1px 0 0; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .footnote { margin-top: 10px; font-size: 9px; color: #5A6577; line-height: 1.5; }
  .monthly { break-before: page; page-break-before: always; margin-top: 14px; }
  .monthly h2 { font-size: 13px; margin: 0 0 6px; }
  .monthly table { font-size: 9px; }
  tr.monthly-total td { border-top: 1.5px solid ${BRAND.gold}; font-weight: 700; }
</style>
</head>
<body>
  <h1>Cabin Crew Logbook</h1>
  <p class="subtitle">
    Generated ${escapeHtml(generatedAt.toISOString().slice(0, 10))} · hours as HH:MM<br />
    Times are local at each station, as printed on the roster. A time marked ⁺ landed on a later date.
  </p>
  <table>
    <thead><tr>${COLUMNS.map((column) => `<th>${column}</th>`).join('')}</tr></thead>
    <tbody>
      ${leadingYear ? yearRow(leadingYear) : ''}
      ${body}
    </tbody>
  </table>
  ${totalsBlock(totals)}
  ${monthlyBlock(months)}
  <p class="footnote">
    Night is computed from the real position of the sun along each route, using civil twilight as
    the boundary. The contractual figure counts ${escapeHtml(describeNightWindow(nightWindow))}.
    Duty hours are counted once per duty, not once per sector.
  </p>
</body>
</html>`;
}

function yearRow(header: { year: string; sectorCount: number; totalMinutes: number }): string {
  return `<tr class="year"><td colspan="${COLUMNS.length}">${escapeHtml(header.year)} — ${
    header.sectorCount
  } sectors · ${minutesToHHMM(header.totalMinutes)}</td></tr>`;
}

/**
 * The month-by-month table.
 *
 * Same figures as the Totals screen, through the same `monthlyTotals`, so the printed document
 * and the app can never disagree — and banded per month, because a band is a property of a
 * month's hours, not of a career's.
 */
function monthlyBlock(months: MonthTotals[]): string {
  if (months.length === 0) return '';

  const totals = bandTotals(months);
  const band = (minutes: number) => (minutes > 0 ? minutesToHHMM(minutes) : '');
  const sick = (month: MonthTotals) => {
    const parts: string[] = [];
    if (month.sickDays > 0) parts.push(`${month.sickDays} sick`);
    if (month.unfitDays > 0) parts.push(`${month.unfitDays} unfit`);
    return parts.join(', ');
  };

  const rows = months
    .map(
      (month) => `<tr>
        ${cell(month.label, 'nowrap')}
        ${cell(month.sectorCount, 'num')}
        ${cell(minutesToHHMM(month.blockMinutes), 'num')}
        ${cell(band(month.bands.midMinutes), 'num')}
        ${cell(band(month.bands.highMinutes), 'num')}
        ${cell(minutesToHHMM(month.nightMinutes), 'num')}
        ${cell(minutesToHHMM(month.dutyMinutes), 'num')}
        ${cell(sick(month))}
      </tr>`,
    )
    .join('\n');

  return `<div class="monthly">
    <h2>By month</h2>
    <table>
      <thead><tr>
        <th>Month</th><th>Sectors</th><th>Block</th>
        <th>${BAND_LOWER_HOURS}–${BAND_UPPER_HOURS}h</th><th>Over ${BAND_UPPER_HOURS}h</th>
        <th>Night</th><th>Duty</th><th>Absence</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="monthly-total">
          ${cell('Total', 'nowrap')}
          ${cell(months.reduce((sum, month) => sum + month.sectorCount, 0), 'num')}
          ${cell(minutesToHHMM(months.reduce((sum, month) => sum + month.blockMinutes, 0)), 'num')}
          ${cell(minutesToHHMM(totals.midMinutes), 'num')}
          ${cell(minutesToHHMM(totals.highMinutes), 'num')}
          ${cell(minutesToHHMM(months.reduce((sum, month) => sum + month.nightMinutes, 0)), 'num')}
          ${cell(minutesToHHMM(months.reduce((sum, month) => sum + month.dutyMinutes, 0)), 'num')}
          ${cell(totals.sickDays > 0 ? `${totals.sickDays} sick` : '')}
        </tr>
      </tbody>
    </table>
  </div>`;
}

function totalsBlock(totals: LogbookSummary): string {
  const items: [string, string][] = [
    ['Sectors', String(totals.sectorCount)],
    ['Block hours', minutesToHHMM(totals.blockMinutes)],
    ['Deadhead', minutesToHHMM(totals.deadheadMinutes)],
    ['Day', minutesToHHMM(totals.dayMinutes)],
    ['Night (actual)', minutesToHHMM(totals.nightMinutes)],
    ['Night (contractual)', minutesToHHMM(totals.windowNightMinutes)],
    [`Duty (${totals.dutyCount})`, minutesToHHMM(totals.dutyMinutes)],
    [`Ground duty (${totals.groundDutyCount})`, minutesToHHMM(totals.groundDutyMinutes)],
  ];

  return `<div class="totals"><dl>${items
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`)
    .join('')}</dl></div>`;
}
