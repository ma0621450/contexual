import { getUtcMonthStart, isLimitReached } from './usage-period';

describe('monthly usage limits', () => {
  it('uses the first instant of the UTC month', () => {
    expect(getUtcMonthStart(new Date('2026-07-31T23:59:59.999Z'))).toEqual(
      new Date('2026-07-01T00:00:00.000Z'),
    );
  });

  it('handles the December to January rollover', () => {
    expect(getUtcMonthStart(new Date('2027-01-01T00:00:00.000Z'))).toEqual(
      new Date('2027-01-01T00:00:00.000Z'),
    );
  });

  it.each([
    [0, 0, false],
    [100, null, false],
    [79, 100, false],
    [100, 100, true],
    [101, 100, true],
  ])('checks used=%s limit=%s', (used, limit, expected) => {
    expect(isLimitReached(used, limit)).toBe(expected);
  });
});
