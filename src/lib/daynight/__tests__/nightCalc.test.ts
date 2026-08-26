import { calculateDayNight } from '../nightCalc';

describe('day and night from the sun', () => {
  it('splits a sector into day and night that sum to its block time', () => {
    const result = calculateDayNight({
      date: '2026-07-08',
      departureAirport: 'NQZ',
      arrivalAirport: 'CXR',
      timeOut: '23:09',
      timeIn: '09:03',
      arrivalDate: '2026-07-09',
    })!;

    expect(result.blockMinutes).toBe(7 * 60 + 54);
    expect(result.dayMinutes + result.nightMinutes).toBe(result.blockMinutes);
    // Leaves Astana near midnight and lands in Vietnam after sunrise: mostly, not entirely, dark.
    expect(result.nightMinutes).toBeGreaterThan(4 * 60);
    expect(result.dayMinutes).toBeGreaterThan(0);
  });

  it('records a midsummer daytime sector as all day', () => {
    const result = calculateDayNight({
      date: '2026-07-31',
      departureAirport: 'ALA',
      arrivalAirport: 'LHR',
      timeOut: '12:34',
      timeIn: '17:40',
    })!;

    expect(result.nightMinutes).toBe(0);
    expect(result.dayMinutes).toBe(result.blockMinutes);
  });

  it('records a sector flown wholly in darkness as all night, to the exact minute', () => {
    const result = calculateDayNight({
      date: '2026-07-24',
      departureAirport: 'URA',
      arrivalAirport: 'ALA',
      timeOut: '23:35',
      timeIn: '02:39',
      arrivalDate: '2026-07-25',
    })!;

    // Not rounded to the nearest five: rounding unbroken night down would claim minutes of
    // daylight that never happened.
    expect(result.nightMinutes).toBe(result.blockMinutes);
    expect(result.dayMinutes).toBe(0);
  });

  it('rounds a mixed sector to the nearest five minutes without losing any of it', () => {
    const result = calculateDayNight({
      date: '2026-07-15',
      departureAirport: 'NQZ',
      arrivalAirport: 'IST',
      timeOut: '18:05',
      timeIn: '22:20',
    })!;

    expect(result.nightMinutes % 5).toBe(0);
    expect(result.dayMinutes + result.nightMinutes).toBe(result.blockMinutes);
  });

  it('uses the sun over the route, not over the departure station', () => {
    // Seoul is already in daylight while Almaty is still dark, so a westbound morning departure
    // that stays in daylight the whole way must not be credited with night.
    const result = calculateDayNight({
      date: '2026-07-27',
      departureAirport: 'ICN',
      arrivalAirport: 'ALA',
      timeOut: '11:23',
      timeIn: '14:23',
    })!;

    expect(result.blockMinutes).toBe(7 * 60);
    expect(result.nightMinutes).toBe(0);
  });

  it('gives nothing rather than a guess when a station is unknown', () => {
    expect(
      calculateDayNight({
        date: '2026-07-25',
        departureAirport: 'ALA',
        arrivalAirport: 'ZZZZ',
        timeOut: '10:00',
        timeIn: '12:00',
      }),
    ).toBeUndefined();
  });
});
