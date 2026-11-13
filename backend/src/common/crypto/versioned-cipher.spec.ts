import { randomBytes } from 'crypto';
import {
  deriveEncryptionKey,
  MissingEncryptionKeyError,
  VersionedCipher,
} from './versioned-cipher';

describe('VersionedCipher', () => {
  const legacy = randomBytes(32);
  const current = randomBytes(32);

  const legacyOnly = new VersionedCipher({ legacy });
  const withCurrent = new VersionedCipher({ legacy, current });

  it('writes the legacy format when no current key is configured', () => {
    const encrypted = legacyOnly.encrypt('secret');

    expect(encrypted.split(':')).toHaveLength(3);
    expect(legacyOnly.isCurrentFormat(encrypted)).toBe(false);
    expect(legacyOnly.decrypt(encrypted)).toBe('secret');
  });

  it('writes the v2 format when a current key is configured', () => {
    const encrypted = withCurrent.encrypt('secret');

    expect(encrypted.startsWith('v2:')).toBe(true);
    expect(withCurrent.decrypt(encrypted)).toBe('secret');
  });

  it('keeps reading legacy values after a current key is configured', () => {
    const encrypted = legacyOnly.encrypt('secret');

    expect(withCurrent.decrypt(encrypted)).toBe('secret');
    expect(withCurrent.needsUpgrade(encrypted)).toBe(true);
  });

  it('does not report upgrades without a current key, or for v2 values', () => {
    expect(legacyOnly.needsUpgrade(legacyOnly.encrypt('secret'))).toBe(false);
    expect(withCurrent.needsUpgrade(withCurrent.encrypt('secret'))).toBe(false);
  });

  it('throws MissingEncryptionKeyError for a v2 value without a current key', () => {
    const encrypted = withCurrent.encrypt('secret');

    expect(() => legacyOnly.decrypt(encrypted)).toThrow(
      MissingEncryptionKeyError,
    );
  });

  it('throws when the value was encrypted with a different key', () => {
    const other = new VersionedCipher({
      legacy: randomBytes(32),
      current: randomBytes(32),
    });

    expect(() => other.decrypt(withCurrent.encrypt('secret'))).toThrow();
    expect(() => other.decrypt(legacyOnly.encrypt('secret'))).toThrow();
  });

  it('throws for malformed values', () => {
    expect(() => withCurrent.decrypt('not-encrypted')).toThrow(
      'Invalid encrypted value format',
    );
  });

  it('uses a fresh IV for every encryption', () => {
    expect(withCurrent.encrypt('secret')).not.toBe(
      withCurrent.encrypt('secret'),
    );
  });
});

describe('deriveEncryptionKey', () => {
  it('derives a stable 32-byte key per secret and purpose', () => {
    const key = deriveEncryptionKey('secret', 'totp-secret');

    expect(key).toHaveLength(32);
    expect(deriveEncryptionKey('secret', 'totp-secret').equals(key)).toBe(true);
    expect(deriveEncryptionKey('secret', 'smtp-password').equals(key)).toBe(
      false,
    );
    expect(deriveEncryptionKey('other', 'totp-secret').equals(key)).toBe(false);
  });
});
