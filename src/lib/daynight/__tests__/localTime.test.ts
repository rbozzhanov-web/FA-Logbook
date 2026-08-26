import { resolveSectorTimes, stationTimeToUtc, timezoneSupportAvailable } from '../localTime';

describe('station-local times', () => {
  it('is running somewhere that can resolve IANA timezones at all', () => {
    // Everything below is meaningless without this, so it is asserted rather than assumed.
    expect(timezoneSupportAvailable()).toBe(true);
  });

  it('resolves a station clock reading into a real instant', () => {
    const utc = stationTimeToUtc('2026-07-25', '23:55', 'ALA');
    expect(utc?.toISO()).toBe('2026-07-25T18:55:00.000Z');
  });

  it('applies daylight saving where the station observes it', () => {
    // London is BST in July and GMT in January, and a logbook that ignored that would be an hour
    // out for half the year.
    expect(stationTimeToUtc('2026-07-15', '12:00', 'LHR')?.toISO()).toBe('2026-07-15T11:00:00.000Z');
    expect(stationTimeToUtc('2026-01-15', '12:00', 'LHR')?.toISO()).toBe('2026-01-15T12:00:00.000Z');
  });

  it('handles a station on a half-hour offset', () => {
    expect(stationTimeToUtc('2026-07-28', '10:25', 'DEL')?.toISO()).toBe('2026-07-28T04:55:00.000Z');
  });

  it('refuses rather than guessing when the station is unknown', () => {
    // Falling back to UTC here would produce hours that look right and are wrong by half a day.
    expect(stationTimeToUtc('2026-07-25', '10:00', 'ZZZZ')).toBeUndefined();
  });
});

describe('resolving a sector', () => {
  it('measures block time across two timezones, not on the clock face', () => {
    // ALA (UTC+5) to ICN (UTC+9): 23:55 to 09:39 reads as 9h44 on the clocks and is 5h44.
    const times = resolveSectorTimes({
      date: '2026-07-25',
      timeOut: '23:55',
      timeIn: '09:39',
      departureAirport: 'ALA',
      arrivalAirport: 'ICN',
      arrivalDate: '2026-07-26',
    });

    expect(times?.blockMinutes).toBe(5 * 60 + 44);
  });

  it('measures a sector that gains time flying west', () => {
    // ICN (UTC+9) to ALA (UTC+5): 11:23 to 14:23 reads as 3h and is 7h.
    const times = resolveSectorTimes({
      date: '2026-07-27',
      timeOut: '11:23',
      timeIn: '14:23',
      departureAirport: 'ICN',
      arrivalAirport: 'ALA',
    });

    expect(times?.blockMinutes).toBe(7 * 60);
    expect(times?.arrivalDate).toBe('2026-07-27');
  });

  it('rolls a midnight crossing forward when no arrival date is given', () => {
    const times = resolveSectorTimes({
      date: '2026-07-24',
      timeOut: '23:35',
      timeIn: '02:39',
      departureAirport: 'URA',
      arrivalAirport: 'ALA',
    });

    expect(times?.blockMinutes).toBe(3 * 60 + 4);
    expect(times?.arrivalDate).toBe('2026-07-25');
  });

  it('reports the arrival date at the arrival station, which can differ from the roster column', () => {
    const times = resolveSectorTimes({
      date: '2026-07-25',
      timeOut: '23:55',
      timeIn: '09:39',
      departureAirport: 'ALA',
      arrivalAirport: 'ICN',
      arrivalDate: '2026-07-26',
    });

    expect(times?.arrivalDate).toBe('2026-07-26');
  });

  it('refuses a sector whose stations it cannot place', () => {
    expect(
      resolveSectorTimes({
        date: '2026-07-25',
        timeOut: '10:00',
        timeIn: '12:00',
        departureAirport: 'ALA',
        arrivalAirport: 'ZZZZ',
      }),
    ).toBeUndefined();
  });
});
