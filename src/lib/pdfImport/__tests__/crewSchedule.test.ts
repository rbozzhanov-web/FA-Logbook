import { minutesToHHMM } from '@/src/lib/time';
import { buildCrewSchedulePage, ReportSpec } from '../__fixtures__/crewScheduleSample';
import { parseRoster } from '../parseRoster';
import { ParsedCandidate } from '../types';

/**
 * A July roster covering the shapes the format actually throws at the parser:
 *
 *  - a plain same-day sector;
 *  - a positioning sector, marked with an asterisk and no aircraft type;
 *  - two sectors in one duty, the second landing after midnight in the next day's column;
 *  - a duty that itself runs past midnight although its last sector landed before it;
 *  - a day carrying two duties, printing release and report as two adjacent times;
 *  - a day off, a downroute day off with its 00:00–23:59 pair, and a ground duty.
 */
const SPEC: ReportSpec = {
  period: '01/07/2026 - 10/07/2026',
  subject: '8557 DOE JANE ALA-FJ-321L',
  blockHours: '25:36',
  nightHours: '08:00',
  days: [
    { day: '01/07', weekday: 'Wed', cells: ['OFF'] },

    // One duty, one sector, entirely inside the day.
    {
      day: '02/07',
      weekday: 'Thu',
      cells: ['05:20', '925', 'A06:56', 'ALA', 'AYT', 'A10:58', '[321]', '11:28'],
      memo: true,
    },

    // Downroute day off: a code followed by a time pair that must not be read as a duty.
    { day: '03/07', weekday: 'Fri', cells: ['DOFF', '00:00', '23:59'] },

    // A positioning sector — asterisk, no aircraft type, and no release time printed after it —
    // then a second duty whose report time is the only lone time between them.
    {
      day: '04/07',
      weekday: 'Sat',
      cells: [
        '02:50', '8510', 'A04:26', '*ALA', 'NQZ', 'A06:09',
        '17:50', '313', 'A19:22', 'NQZ', 'SCO', 'A22:08', '[321]',
        '314', 'A22:56', 'SCO', '→',
      ],
    },

    // The arrival half of flight 314, then this day's own second duty.
    {
      day: '05/07',
      weekday: 'Sun',
      cells: ['↓', 'NQZ', '01:35', '[321]', 'Delay', '00:02', '02:05', '21:25', '157', 'A23:09', 'NQZ', '→'],
    },

    // Flight 157's arrival, a day later and two timezones east.
    { day: '06/07', weekday: 'Mon', cells: ['↓', 'CXR', 'A09:03', '[321L]', '09:33'] },

    { day: '07/07', weekday: 'Tue', cells: ['OFF'] },

    // A duty that crosses midnight although its sector landed before it: the arrow stands alone.
    {
      day: '08/07',
      weekday: 'Wed',
      cells: ['19:00', '859', 'A20:35', 'ALA', 'SCO', 'A23:45', '[321]', '→'],
    },
    {
      day: '09/07',
      weekday: 'Thu',
      cells: ['↓', '860', 'A00:47', 'SCO', 'ALA', 'A03:52', '[321]', 'Delay', '00:05', '04:22'],
    },

    // A ground duty: a code and its two times.
    { day: '10/07', weekday: 'Fri', cells: ['HYGT', '08:00', '17:00'] },
  ],
  crew: [
    {
      date: '02/07/2026',
      flightNumber: '925',
      details: 'CP - 100 - SMITH JOHN | PU - 200 - BROWN ANNA | FJ - 8557 - DOE JANE',
    },
    {
      date: '03/07/2026',
      flightNumber: '8510',
      details: 'CP - 101 - JONES PAT | PU - 201 - GREEN SAM | FJ - DHC - 8557 - DOE JANE |',
      wrapped: ['FY - 300 - GREY LEE'],
    },
  ],
};

function candidatesByFlight(candidates: ParsedCandidate[]): Map<string, ParsedCandidate> {
  return new Map(candidates.map((c) => [c.fields.flightNumber ?? c.fields.dutyCode ?? '', c]));
}

describe('the Air Astana crew schedule parser', () => {
  const result = parseRoster([buildCrewSchedulePage(SPEC)]);
  const byFlight = candidatesByFlight(result.candidates);

  it('recognises the report and reads who it belongs to', () => {
    expect(result.ruleId).toBe('air-astana-personal-crew-schedule-v1');
    expect(result.subject).toMatchObject({
      staffId: '8557',
      name: 'DOE JANE',
      base: 'ALA',
      rank: 'FJ',
      periodStart: '2026-07-01',
      periodEnd: '2026-07-10',
    });
  });

  it('reads every sector and the ground duty, and nothing else', () => {
    expect(new Set(byFlight.keys())).toEqual(
      new Set(['925', '8510', '313', '314', '157', '859', '860', 'HYGT']),
    );
  });

  it('converts station-local clock times into real block time across timezones', () => {
    // ALA is UTC+5 and AYT UTC+3, so 06:56 to 10:58 on the clock is six hours and two minutes.
    expect(byFlight.get('925')!.fields.blockMinutes).toBe(6 * 60 + 2);
  });

  it('follows a sector across midnight into the next day’s column', () => {
    const sector = byFlight.get('314')!.fields;
    expect(sector.date).toBe('2026-07-04');
    expect(sector.arrivalDate).toBe('2026-07-05');
    expect(sector.arrivalAirport).toBe('NQZ');
    expect(sector.timeIn).toBe('01:35');
    expect(sector.blockMinutes).toBe(2 * 60 + 39);
  });

  it('follows a sector that lands a day later and two timezones east', () => {
    // NQZ (UTC+5) 23:09 to CXR (UTC+7) 09:03 next day is 7h54, not the 9h54 the clocks suggest.
    const sector = byFlight.get('157')!.fields;
    expect(sector.arrivalDate).toBe('2026-07-06');
    expect(sector.blockMinutes).toBe(7 * 60 + 54);
  });

  it('logs a positioning sector apart from block time', () => {
    const sector = byFlight.get('8510')!.fields;
    expect(sector.kind).toBe('deadhead');
    expect(sector.blockMinutes).toBe(0);
    expect(sector.deadheadMinutes).toBe(103);
    // The grid's asterisk and the crew list's DHC tag agree, so this needs no checking.
    expect(sector.departureAirport).toBe('ALA');
  });

  it('reproduces the report’s own Block Hours total exactly', () => {
    const check = result.crossChecks.find((c) => c.label === 'Block hours')!;
    expect(minutesToHHMM(check.parsedTotalMinutes)).toBe('25:36');
    expect(check.matches).toBe(true);
  });

  it('reports the airline’s night figure as a comparison rather than a target', () => {
    const check = result.crossChecks.find((c) => c.label === 'Night hours')!;
    expect(check.informational).toBe(true);
    expect(check.reportedTotalMinutes).toBe(8 * 60);
  });

  it('reads a lone time after a positioning duty as the next duty’s report, not a release', () => {
    // 17:50 sits between the deadhead's arrival and flight 313. Read as a release it would close
    // the positioning duty eleven hours after it ended and leave 313's duty with no start at all.
    expect(byFlight.get('313')!.fields.dutyStart).toBe('2026-07-04T17:50');
    expect(byFlight.get('8510')!.fields.dutyEnd).toBeUndefined();
  });

  it('closes a duty on the release time and opens the next on the report time', () => {
    // 05/07 prints "02:05" then "21:25": the first closes the overnight duty, the second opens
    // the evening one.
    expect(byFlight.get('314')!.fields.dutyEnd).toBe('2026-07-05T02:05');
    expect(byFlight.get('157')!.fields.dutyStart).toBe('2026-07-05T21:25');
  });

  it('keeps a duty open across midnight when only the duty continues', () => {
    // 859 lands at 23:45 and 860 leaves at 00:47 the next day: one duty of two sectors, not two.
    const outbound = byFlight.get('859')!.fields;
    const inbound = byFlight.get('860')!.fields;
    expect(outbound.dutyStart).toBe('2026-07-08T19:00');
    expect(outbound.dutyEnd).toBe('2026-07-09T04:22');
    expect(inbound.dutyStart).toBe(outbound.dutyStart);
    expect(outbound.dutySectorIndex).toBe(1);
    expect(inbound.dutySectorIndex).toBe(2);
    expect(inbound.dutySectorCount).toBe(2);
  });

  it('numbers the two sectors of a duty in order', () => {
    expect(byFlight.get('313')!.fields.dutySectorIndex).toBe(1);
    expect(byFlight.get('314')!.fields.dutySectorIndex).toBe(2);
    expect(byFlight.get('314')!.fields.dutySectorCount).toBe(2);
  });

  it('logs a ground duty with hours but no flying', () => {
    const ground = byFlight.get('HYGT')!.fields;
    expect(ground.kind).toBe('ground');
    expect(ground.groundDutyMinutes).toBe(9 * 60);
    expect(ground.blockMinutes).toBe(0);
    expect(ground.nightMinutes).toBe(0);
    // The report never says where a ground duty happened, so the crew member's base stands in.
    expect(ground.departureAirport).toBe('ALA');
  });

  it('ignores days off, downroute days off and their time pairs', () => {
    const dates = result.candidates.map((c) => c.fields.date);
    expect(dates).not.toContain('2026-07-01');
    expect(dates).not.toContain('2026-07-03');
    expect(dates).not.toContain('2026-07-07');
  });

  it('reads the crew list, including a details cell that wraps onto another line', () => {
    const sector = byFlight.get('925')!.fields;
    expect(sector.captainName).toBe('SMITH JOHN');
    expect(sector.purserName).toBe('BROWN ANNA');
    expect(sector.position).toBe('FJ');

    // The wrapped line's crew member has to survive the row grouping.
    expect(byFlight.get('8510')!.fields.otherCrewNames).toContain('GREY LEE');
  });

  it('keeps airport codes exactly as the roster prints them', () => {
    const sector = byFlight.get('925')!.fields;
    expect(sector.departureAirport).toBe('ALA');
    expect(sector.arrivalAirport).toBe('AYT');
  });

  it('splits every sector into day and night that sum to its own time', () => {
    for (const candidate of result.candidates) {
      if (candidate.fields.kind === 'ground') continue;
      const airborne = (candidate.fields.blockMinutes ?? 0) + (candidate.fields.deadheadMinutes ?? 0);
      expect((candidate.fields.dayMinutes ?? 0) + (candidate.fields.nightMinutes ?? 0)).toBe(airborne);
    }
  });

  it('does not mistake the memo marker row for a cell', () => {
    expect(result.candidates.every((c) => c.fields.flightNumber !== 'M')).toBe(true);
  });

  it('declines a document it does not recognise', () => {
    const other = buildCrewSchedulePage({ ...SPEC, title: 'Some Other Airline Report' });
    other.items = other.items.filter((entry) => entry.str !== 'AIR ASTANA');
    expect(parseRoster([other]).ruleId).toBe('none');
  });
});
