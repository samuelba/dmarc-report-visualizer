import { AuthStatus, decideCollision, rankOf } from './report-provenance';

describe('report provenance', () => {
  describe('rankOf', () => {
    it.each<[AuthStatus, number]>([
      ['aligned', 3],
      ['unaligned', 2],
      ['manual', 2],
      ['unverified', 1],
      ['legacy', 1],
    ])('ranks %s as %d', (status, rank) => {
      expect(rankOf(status)).toBe(rank);
    });
  });

  describe('decideCollision', () => {
    const copy = (authStatus: AuthStatus, contentHash: string | null) => ({
      authStatus,
      contentHash,
    });

    it('treats an identical copy as a duplicate regardless of rank', () => {
      expect(
        decideCollision(copy('unverified', 'h1'), copy('aligned', 'h1')),
      ).toBe('duplicate');
    });

    it('replaces when the incoming copy ranks strictly higher', () => {
      expect(
        decideCollision(copy('unaligned', 'h1'), copy('aligned', 'h2')),
      ).toBe('replaced');
      expect(
        decideCollision(copy('legacy', 'h1'), copy('unaligned', 'h2')),
      ).toBe('replaced');
    });

    it('keeps the existing copy on equal rank', () => {
      expect(
        decideCollision(copy('aligned', 'h1'), copy('aligned', 'h2')),
      ).toBe('conflict');
      expect(
        decideCollision(copy('unaligned', 'h1'), copy('manual', 'h2')),
      ).toBe('conflict');
    });

    it('keeps the existing copy when the incoming copy ranks lower', () => {
      expect(
        decideCollision(copy('aligned', 'h1'), copy('unverified', 'h2')),
      ).toBe('conflict');
    });

    it('never treats missing hashes as identical', () => {
      expect(
        decideCollision(copy('aligned', null), copy('aligned', null)),
      ).toBe('conflict');
    });
  });
});
