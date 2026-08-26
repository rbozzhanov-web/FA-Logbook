import { DEFAULT_NIGHT_WINDOW, calculateWindowNight, isMinuteInWindow } from '../nightWindow';

describe('the night window itself', () => {
  const window = DEFAULT_NIGHT_WINDOW; // 22:00–06:00

  it('wraps around midnight', () => {
    expect(isMinuteInWindow(22 * 60, window)).toBe(true);
    expect(isMinuteInWindow(23 * 60 + 59, window)).toBe(true);
    expect(isMinuteInWindow(0, window)).toBe(true);
    expect(isMinuteInWindow(5 * 60 + 59, window)).toBe(true);
  });

  it('excludes the daytime either side of it', () => {
    expect(isMinuteInWindow(6 * 60, window)).toBe(false);
    expect(isMinuteInWindow(12 * 60, window)).toBe(false);
    expect(isMinuteInWindow(21 * 60 + 59, window)).toBe(false);
  });

  it('handles a window that does not wrap', () => {
    const daytime = { startMinute: 9 * 60, endMinute: 17 * 60, basis: 'utc' as const };
    expect(isMinuteInWindow(12 * 60, daytime)).toBe(true);
    expect(isMinuteInWindow(8 * 60, daytime)).toBe(false);
    expect(isMinuteInWindow(17 * 60, daytime)).toBe(false);
  });

  it('treats a window with equal ends as empty rather than as the whole day', () => {
    // Far more likely a half-filled setting than a claim that every hour is night.
    const degenerate = { startMinute: 22 * 60, endMinute: 22 * 60, basis: 'station' as const };
    expect(isMinuteInWindow(3 * 60, degenerate)).toBe(false);
    expect(isMinuteInWindow(22 * 60, degenerate)).toBe(false);
  });
});

describe('counting a sector against the window', () => {
  const sector = {
    date: '2026-07-12',
    departureAirport: 'ALA',
    arrivalAirport: 'SCO',
    timeOut: '20:35',
    timeIn: '23:45',
  };

  it('counts only the part of the sector inside the window', () => {
    // Departs 20:35 Almaty time, so 22:00 to 23:45 falls inside: 1h45.
    expect(calculateWindowNight(sector, DEFAULT_NIGHT_WINDOW)).toBe(105);
  });

  it('reads the window on the departure station’s clock, not the device’s', () => {
    // Almaty is UTC+5, so on the UTC basis the same sector runs 15:35–18:45 Zulu — no night at
    // all. A device happening to sit in another zone must not change either answer.
    expect(calculateWindowNight(sector, { ...DEFAULT_NIGHT_WINDOW, basis: 'utc' })).toBe(0);
  });

  it('counts a sector flown entirely inside the window in full', () => {
    const overnight = {
      date: '2026-07-24',
      departureAirport: 'URA',
      arrivalAirport: 'ALA',
      timeOut: '23:35',
      timeIn: '02:39',
      arrivalDate: '2026-07-25',
    };
    expect(calculateWindowNight(overnight, DEFAULT_NIGHT_WINDOW)).toBe(3 * 60 + 4);
  });

  it('counts nothing for a sector flown entirely outside it', () => {
    expect(
      calculateWindowNight(
        {
          date: '2026-07-31',
          departureAirport: 'ALA',
          arrivalAirport: 'LHR',
          timeOut: '12:34',
          timeIn: '17:40',
        },
        DEFAULT_NIGHT_WINDOW,
      ),
    ).toBe(0);
  });

  it('gives nothing rather than a guess when a station is unknown', () => {
    expect(
      calculateWindowNight(
        { ...sector, arrivalAirport: 'ZZZZ' },
        DEFAULT_NIGHT_WINDOW,
      ),
    ).toBeUndefined();
  });
});
