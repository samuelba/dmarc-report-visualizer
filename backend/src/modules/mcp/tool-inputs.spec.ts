import { domainSchema, resolveRange, ToolInputError } from './tool-inputs';

const NOW = new Date('2026-11-15T12:00:00Z');

describe('resolveRange', () => {
  it('defaults to the last 30 days', () => {
    expect(resolveRange({}, NOW)).toEqual({
      from: new Date('2026-10-16T12:00:00Z'),
      to: NOW,
    });
  });

  it('treats a date-only `to` as the end of that day', () => {
    expect(resolveRange({ from: '2026-11-01', to: '2026-11-02' }, NOW)).toEqual(
      {
        from: new Date('2026-11-01T00:00:00.000Z'),
        to: new Date('2026-11-02T23:59:59.999Z'),
      },
    );
  });

  it('accepts datetimes with an offset', () => {
    expect(
      resolveRange(
        { from: '2026-11-01T00:00:00+01:00', to: '2026-11-02T00:00:00Z' },
        NOW,
      ).from,
    ).toEqual(new Date('2026-10-31T23:00:00Z'));
  });

  it('rejects `from` after `to`', () => {
    expect(() =>
      resolveRange({ from: '2026-11-05', to: '2026-11-01' }, NOW),
    ).toThrow(ToolInputError);
  });

  it('rejects ranges longer than 366 days', () => {
    expect(() =>
      resolveRange({ from: '2025-01-01', to: '2026-11-01' }, NOW),
    ).toThrow(/at most 366 days/);
  });
});

describe('domainSchema', () => {
  it('normalises case and whitespace', () => {
    expect(domainSchema.parse(' Example.COM ')).toBe('example.com');
  });

  it.each(['', 'a b', "x'; DROP TABLE", 'a'.repeat(254), 'exa%mple.com'])(
    'rejects %p',
    (value) => {
      expect(domainSchema.safeParse(value).success).toBe(false);
    },
  );
});
