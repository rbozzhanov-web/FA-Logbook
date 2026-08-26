import { CabinCrewLogEntry } from '@/src/types/logbook';
import { annotateDuplicates } from '../dedupe';
import { ParsedCandidate } from '../types';

function existing(overrides: Partial<CabinCrewLogEntry>): CabinCrewLogEntry {
  return {
    id: 'existing',
    date: '2026-07-14',
    kind: 'operating',
    departureAirport: 'ALA',
    arrivalAirport: 'NQZ',
    flightNumber: '6410',
    timeOut: '04:13',
    blockMinutes: 102,
    deadheadMinutes: 0,
    groundDutyMinutes: 0,
    dayMinutes: 57,
    nightMinutes: 45,
    source: 'pdf_import',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

function candidate(fields: Partial<CabinCrewLogEntry>): ParsedCandidate {
  return { fields, rawSourceLine: '', confidence: 'high', unmatchedFields: [] };
}

describe('spotting entries already in the logbook', () => {
  it('flags the same sector arriving in an overlapping roster', () => {
    // Monthly rosters overlap at the edges, so this is the normal case, not an edge case.
    const [annotated] = annotateDuplicates(
      [candidate({ date: '2026-07-14', kind: 'operating', departureAirport: 'ALA', arrivalAirport: 'NQZ', flightNumber: '6410', timeOut: '04:13' })],
      [existing({})],
    );
    expect(annotated.isDuplicate).toBe(true);
  });

  it('does not flag a different day', () => {
    const [annotated] = annotateDuplicates(
      [candidate({ date: '2026-07-15', kind: 'operating', departureAirport: 'ALA', arrivalAirport: 'NQZ', flightNumber: '6410' })],
      [existing({})],
    );
    expect(annotated.isDuplicate).toBe(false);
  });

  it('does not collapse a sector worked into one deadheaded on the same route', () => {
    // Positioning out and operating back on the same day is a real pattern, and merging the two
    // would erase a sector's hours.
    const [annotated] = annotateDuplicates(
      [candidate({ date: '2026-07-14', kind: 'deadhead', departureAirport: 'ALA', arrivalAirport: 'NQZ', flightNumber: '6410' })],
      [existing({})],
    );
    expect(annotated.isDuplicate).toBe(false);
  });

  it('does not collapse two different flights on the same route and day', () => {
    const [annotated] = annotateDuplicates(
      [candidate({ date: '2026-07-14', kind: 'operating', departureAirport: 'ALA', arrivalAirport: 'NQZ', flightNumber: '8510' })],
      [existing({})],
    );
    expect(annotated.isDuplicate).toBe(false);
  });

  it('matches ground duties by their code, not by a route they do not have', () => {
    const ground = existing({ kind: 'ground', dutyCode: 'HYGT', departureAirport: 'ALA', arrivalAirport: 'ALA', flightNumber: undefined });

    const [same] = annotateDuplicates(
      [candidate({ date: '2026-07-14', kind: 'ground', dutyCode: 'HYGT' })],
      [ground],
    );
    expect(same.isDuplicate).toBe(true);

    const [other] = annotateDuplicates(
      [candidate({ date: '2026-07-14', kind: 'ground', dutyCode: 'SEPT' })],
      [ground],
    );
    expect(other.isDuplicate).toBe(false);
  });

  it('never lets a ground duty collapse into a sector on the same day', () => {
    const [annotated] = annotateDuplicates(
      [candidate({ date: '2026-07-14', kind: 'ground', dutyCode: 'HYGT' })],
      [existing({})],
    );
    expect(annotated.isDuplicate).toBe(false);
  });

  it('returns duplicates rather than dropping them, so a deliberate re-import is still possible', () => {
    const annotated = annotateDuplicates(
      [candidate({ date: '2026-07-14', kind: 'operating', departureAirport: 'ALA', arrivalAirport: 'NQZ', flightNumber: '6410' })],
      [existing({})],
    );
    expect(annotated).toHaveLength(1);
  });
});
