import { findAirportCoords, findAirportTimezone, isKnownAirport } from '../airportDb';

describe('the airport database', () => {
  it('finds an airport by its IATA code', () => {
    const coords = findAirportCoords('ALA');
    expect(coords?.lat).toBeCloseTo(43.35, 1);
    expect(coords?.lon).toBeCloseTo(77.04, 1);
  });

  it('finds the same airport by its ICAO code', () => {
    expect(findAirportCoords('UAAA')).toEqual(findAirportCoords('ALA'));
  });

  it('gives every station on a real roster a timezone', () => {
    // Without one, a station-local roster time cannot be turned into an instant at all, so a
    // gap here is not a cosmetic miss — it is a sector whose hours cannot be computed.
    for (const code of ['ALA', 'NQZ', 'AYT', 'SCO', 'CXR', 'IST', 'ICN', 'DEL', 'LHR', 'URA']) {
      expect(findAirportTimezone(code)).toBeTruthy();
    }
  });

  it('knows the timezones Kazakhstan actually keeps', () => {
    // The whole country moved to UTC+5 in 2024, including the western stations that were +4.
    expect(findAirportTimezone('ALA')).toBe('Asia/Almaty');
    expect(findAirportTimezone('SCO')).toBe('Asia/Aqtau');
    expect(findAirportTimezone('URA')).toBe('Asia/Oral');
  });

  it('resolves a retired code to the right airport without renaming it', () => {
    // TSE was Astana's IATA code until 2020. A roster from before then must still find the
    // airport — but the logbook keeps whatever code was flown under, so this only ever
    // redirects a lookup.
    expect(findAirportCoords('TSE')).toEqual(findAirportCoords('NQZ'));
    expect(findAirportTimezone('TSE')).toBe('Asia/Almaty');
  });

  it('reports an unknown code as unknown rather than inventing a location', () => {
    expect(isKnownAirport('ZZZZ')).toBe(false);
    expect(findAirportCoords('ZZZZ')).toBeUndefined();
    expect(findAirportTimezone('ZZZZ')).toBeUndefined();
  });

  it('accepts lower-case and padded input', () => {
    expect(findAirportCoords(' ala ')).toEqual(findAirportCoords('ALA'));
  });
});
