import { CabinCrewLogEntry } from '@/src/types/logbook';
import { hasNoHours, missingRequiredFields } from '../candidateCompleteness';

function fields(overrides: Partial<CabinCrewLogEntry>): Partial<CabinCrewLogEntry> {
  return { date: '2026-07-20', ...overrides };
}

describe('an absence candidate from the roster', () => {
  it('is never flagged as having no hours — that is exactly what an absence is', () => {
    expect(hasNoHours(fields({ kind: 'absence', dutyCode: 'SICK', blockMinutes: 0 }))).toBe(false);
  });

  it('needs only a date, not a station, to be considered complete', () => {
    expect(missingRequiredFields(fields({ kind: 'absence', departureAirport: '', arrivalAirport: '' }))).toEqual([]);
  });

  it('is still complete when the parser did resolve a base station', () => {
    expect(
      missingRequiredFields(fields({ kind: 'absence', departureAirport: 'ALA', arrivalAirport: 'ALA' })),
    ).toEqual([]);
  });

  it('is incomplete without even a date', () => {
    expect(missingRequiredFields({ kind: 'absence', dutyCode: 'SICK' })).toEqual(['date']);
  });
});

describe('an operating sector with no hours', () => {
  it('is still flagged — the absence exemption must not swallow a real gap', () => {
    expect(
      hasNoHours(
        fields({ kind: 'operating', departureAirport: 'ALA', arrivalAirport: 'NQZ', blockMinutes: 0 }),
      ),
    ).toBe(true);
  });

  it('still needs a station', () => {
    expect(missingRequiredFields(fields({ kind: 'operating', departureAirport: '', arrivalAirport: 'NQZ' }))).toEqual(
      ['departureAirport'],
    );
  });
});
