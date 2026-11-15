import { AuthStatus, decideCollision } from './report-provenance';

describe('decideCollision', () => {
  const copy = (authStatus: AuthStatus, contentHash: string | null) => ({
    authStatus,
    contentHash,
  });
  const STATUSES: AuthStatus[] = [
    'aligned',
    'unaligned',
    'manual',
    'unverified',
    'legacy',
  ];

  it('treats an identical copy as a duplicate regardless of status', () => {
    expect(
      decideCollision(copy('unverified', 'h1'), copy('aligned', 'h1')),
    ).toBe('duplicate');
  });

  it.each(STATUSES.filter((s) => s !== 'aligned'))(
    'lets an aligned copy replace a stored %s copy',
    (stored) => {
      expect(decideCollision(copy(stored, 'h1'), copy('aligned', 'h2'))).toBe(
        'replaced',
      );
    },
  );

  it('keeps a stored aligned copy against another aligned copy', () => {
    expect(decideCollision(copy('aligned', 'h1'), copy('aligned', 'h2'))).toBe(
      'conflict',
    );
  });

  // An unaligned copy proves who sent it, not that it owns the claimed
  // report, so it must never displace stored data, including legacy rows.
  it.each(
    STATUSES.flatMap((stored) =>
      (['unaligned', 'manual', 'unverified'] as AuthStatus[]).map(
        (incoming) => [stored, incoming] as const,
      ),
    ),
  )(
    'keeps a stored %s copy against an incoming %s copy',
    (stored, incoming) => {
      expect(decideCollision(copy(stored, 'h1'), copy(incoming, 'h2'))).toBe(
        'conflict',
      );
    },
  );

  it('never treats missing hashes as identical', () => {
    expect(decideCollision(copy('legacy', null), copy('aligned', null))).toBe(
      'replaced',
    );
    expect(decideCollision(copy('aligned', null), copy('aligned', null))).toBe(
      'conflict',
    );
  });
});
