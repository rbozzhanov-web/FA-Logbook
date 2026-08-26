import {
  DEFAULT_NIGHT_WINDOW,
  describeNightWindow,
  parseNightWindow,
  serializeNightWindow,
} from '../nightWindow';

describe('the stored night window', () => {
  it('round-trips through storage', () => {
    const window = { startMinute: 21 * 60 + 30, endMinute: 5 * 60, basis: 'utc' as const };
    expect(parseNightWindow(serializeNightWindow(window))).toEqual(window);
  });

  it('stores legibly, so a backup file can be read by eye', () => {
    expect(serializeNightWindow(DEFAULT_NIGHT_WINDOW)).toBe('22:00-06:00 station');
  });

  it('rejects anything malformed so the caller can fall back to the default', () => {
    for (const raw of ['', 'nonsense', '22:00-06:00', '22:00 06:00 station', '99:99-06:00 station']) {
      expect(parseNightWindow(raw)).toBeUndefined();
    }
  });

  it('describes itself in terms a crew member can check against their agreement', () => {
    expect(describeNightWindow(DEFAULT_NIGHT_WINDOW)).toBe(
      '22:00–06:00, local time at the departure station',
    );
    expect(describeNightWindow({ ...DEFAULT_NIGHT_WINDOW, basis: 'utc' })).toBe('22:00–06:00, UTC');
  });
});
