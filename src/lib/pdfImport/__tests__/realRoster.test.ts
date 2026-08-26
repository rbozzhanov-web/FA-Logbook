import { existsSync, readFileSync } from 'fs';

import { minutesToHHMM } from '@/src/lib/time';
import { parseRoster } from '../parseRoster';
import { ExtractedPage } from '../types';

/**
 * End-to-end check against a real Air Astana Personal Crew Schedule Report, extracted with the
 * same pdf.js build the app ships.
 *
 * The report's own "Block Hours" figure is the oracle, and a demanding one. Reproducing it to
 * the minute means every sector was found, none was counted twice, every arrow across midnight
 * was followed into the next day's column, positioning sectors were excluded — and, above all,
 * that both stations' timezones were applied correctly, since the roster states its times in
 * local station time and a sector's clock readings are not its length.
 *
 * The extracted page data is personal (names, staff numbers, hotel addresses), so it is not
 * committed; the test skips when absent and runs when the fixture is generated locally with
 * `npm run fixture:roster -- <report.pdf>`.
 */
const FIXTURE = '/tmp/fa-realcheck/pages.json';
const describeIfFixture = existsSync(FIXTURE) ? describe : describe.skip;

describeIfFixture('a real Personal Crew Schedule Report', () => {
  const pages = JSON.parse(readFileSync(FIXTURE, 'utf8')) as ExtractedPage[];
  const result = parseRoster(pages);

  const operating = result.candidates.filter((c) => c.fields.kind === 'operating');
  const deadhead = result.candidates.filter((c) => c.fields.kind === 'deadhead');
  const ground = result.candidates.filter((c) => c.fields.kind === 'ground');

  const sum = (list: typeof result.candidates, pick: (c: (typeof result.candidates)[number]) => number) =>
    list.reduce((total, candidate) => total + pick(candidate), 0);

  it('recognises the report', () => {
    expect(result.ruleId).toBe('air-astana-personal-crew-schedule-v1');
    expect(result.subject?.staffId).toMatch(/^\d+$/);
    expect(result.subject?.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reproduces the report's own Block Hours total exactly", () => {
    const check = result.crossChecks.find((c) => c.label === 'Block hours');
    expect(check).toBeDefined();
    expect(minutesToHHMM(check!.parsedTotalMinutes)).toBe(minutesToHHMM(check!.reportedTotalMinutes));
    expect(check!.matches).toBe(true);
  });

  it('keeps positioning sectors out of block hours but still logs them', () => {
    expect(deadhead.length).toBeGreaterThan(0);
    expect(sum(deadhead, (c) => c.fields.blockMinutes ?? 0)).toBe(0);
    expect(sum(deadhead, (c) => c.fields.deadheadMinutes ?? 0)).toBeGreaterThan(0);
  });

  it('never lets a sector carry both block and deadhead time', () => {
    for (const candidate of result.candidates) {
      const block = candidate.fields.blockMinutes ?? 0;
      const dh = candidate.fields.deadheadMinutes ?? 0;
      expect(block === 0 || dh === 0).toBe(true);
    }
  });

  it('splits every flown sector into day and night that sum to its own time', () => {
    for (const candidate of [...operating, ...deadhead]) {
      const airborne = (candidate.fields.blockMinutes ?? 0) + (candidate.fields.deadheadMinutes ?? 0);
      expect((candidate.fields.dayMinutes ?? 0) + (candidate.fields.nightMinutes ?? 0)).toBe(airborne);
    }
  });

  it('gives every sector a route, a date and a positive time', () => {
    for (const candidate of [...operating, ...deadhead]) {
      expect(candidate.fields.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(candidate.fields.departureAirport).toMatch(/^[A-Z]{3,4}$/);
      expect(candidate.fields.arrivalAirport).toMatch(/^[A-Z]{3,4}$/);
      const airborne = (candidate.fields.blockMinutes ?? 0) + (candidate.fields.deadheadMinutes ?? 0);
      expect(airborne).toBeGreaterThan(0);
    }
  });

  it('keeps airport codes exactly as the roster prints them', () => {
    // IATA in, IATA out. Rewriting ALA to UAAA would make the logbook disagree with the roster
    // it was imported from, which is the document it is read against.
    const codes = [...operating, ...deadhead].flatMap((c) => [
      c.fields.departureAirport!,
      c.fields.arrivalAirport!,
    ]);
    expect(codes.every((code) => code.length === 3)).toBe(true);
  });

  it('reads the crew member’s own rank onto each sector', () => {
    expect(operating.every((c) => (c.fields.position ?? '').length > 0)).toBe(true);
  });

  it('numbers each sector within its duty without exceeding the duty’s own count', () => {
    for (const candidate of [...operating, ...deadhead]) {
      const index = candidate.fields.dutySectorIndex;
      const count = candidate.fields.dutySectorCount;
      if (index === undefined || count === undefined) continue;
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(count);
    }
  });

  it('logs ground duties with hours but no flying', () => {
    for (const candidate of ground) {
      expect(candidate.fields.blockMinutes ?? 0).toBe(0);
      expect(candidate.fields.deadheadMinutes ?? 0).toBe(0);
      expect(candidate.fields.nightMinutes ?? 0).toBe(0);
      expect(candidate.fields.dutyCode).toBeTruthy();
    }
  });

  it('reports the airline’s night total as a comparison, not a target', () => {
    const check = result.crossChecks.find((c) => c.label === 'Night hours');
    expect(check?.informational).toBe(true);
  });
});
