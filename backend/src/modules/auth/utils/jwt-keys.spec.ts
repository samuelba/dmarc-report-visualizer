import {
  deriveTokenKey,
  findJwtSecretWeakness,
  JWT_SECRET_MIN_LENGTH,
  JWT_SECRET_SAMPLE_VALUE,
  requireJwtSecret,
} from './jwt-keys';

describe('jwt-keys', () => {
  const secret = 'a-strong-secret-that-is-long-enough-1234';

  describe('deriveTokenKey', () => {
    it('derives a stable 32-byte key, so tokens survive restarts', () => {
      const key = deriveTokenKey(secret, 'access');

      expect(key).toHaveLength(32);
      expect(deriveTokenKey(secret, 'access').equals(key)).toBe(true);
    });

    it('derives a different key for every token type', () => {
      const keys = (['access', 'refresh', 'totp_temp'] as const).map((type) =>
        deriveTokenKey(secret, type).toString('hex'),
      );

      expect(new Set(keys).size).toBe(3);
    });

    it('never uses JWT_SECRET itself as a signing key', () => {
      const key = deriveTokenKey(secret, 'access');

      expect(key.equals(Buffer.from(secret))).toBe(false);
    });

    it('derives different keys from different secrets', () => {
      expect(
        deriveTokenKey(secret, 'access').equals(
          deriveTokenKey(`${secret}x`, 'access'),
        ),
      ).toBe(false);
    });
  });

  describe('requireJwtSecret', () => {
    it.each([[undefined], ['']])('throws for %p', (value) => {
      expect(() => requireJwtSecret(value)).toThrow(
        'JWT_SECRET is not configured',
      );
    });

    it('returns a configured secret', () => {
      expect(requireJwtSecret(secret)).toBe(secret);
    });
  });

  describe('findJwtSecretWeakness', () => {
    it('flags the .env.sample placeholder', () => {
      expect(findJwtSecretWeakness(JWT_SECRET_SAMPLE_VALUE)).toContain(
        '.env.sample',
      );
    });

    it('flags secrets shorter than the minimum length', () => {
      expect(
        findJwtSecretWeakness('x'.repeat(JWT_SECRET_MIN_LENGTH - 1)),
      ).toContain(`shorter than ${JWT_SECRET_MIN_LENGTH}`);
    });

    it('accepts a secret of the minimum length', () => {
      expect(
        findJwtSecretWeakness('x'.repeat(JWT_SECRET_MIN_LENGTH)),
      ).toBeNull();
    });
  });
});
