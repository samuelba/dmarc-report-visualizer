import { randomBytes } from 'crypto';
import { VersionedCipher } from './versioned-cipher';
import { upgradeEncryptedValues } from './upgrade-encrypted-values';

describe('upgradeEncryptedValues', () => {
  const legacy = randomBytes(32);
  const current = randomBytes(32);
  const legacyOnly = new VersionedCipher({ legacy });
  const withCurrent = new VersionedCipher({ legacy, current });
  const foreign = new VersionedCipher({
    legacy: randomBytes(32),
    current: randomBytes(32),
  });

  it('re-encrypts readable legacy values with the current key', async () => {
    const value = legacyOnly.encrypt('secret');
    const save = jest
      .fn<Promise<boolean>, [string, string, string]>()
      .mockResolvedValue(true);

    const report = await upgradeEncryptedValues(
      [{ id: 'a', value }],
      withCurrent,
      save,
    );

    expect(report.upgraded).toEqual(['a']);
    const [id, oldValue, newValue] = save.mock.calls[0];
    expect([id, oldValue]).toEqual(['a', value]);
    expect(withCurrent.isCurrentFormat(newValue)).toBe(true);
    expect(withCurrent.decrypt(newValue)).toBe('secret');
  });

  it('leaves values alone when no current key is configured', async () => {
    const save = jest.fn();

    const report = await upgradeEncryptedValues(
      [{ id: 'a', value: legacyOnly.encrypt('secret') }],
      legacyOnly,
      save,
    );

    expect(report.upgraded).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it('does not count a row another instance already changed', async () => {
    const report = await upgradeEncryptedValues(
      [{ id: 'a', value: legacyOnly.encrypt('secret') }],
      withCurrent,
      jest.fn().mockResolvedValue(false),
    );

    expect(report.upgraded).toEqual([]);
  });

  it('classifies every value that the configured keys cannot read', async () => {
    const save = jest.fn().mockResolvedValue(true);

    const report = await upgradeEncryptedValues(
      [
        { id: 'ok', value: withCurrent.encrypt('secret') },
        { id: 'wrong-current', value: foreign.encrypt('secret') },
        {
          id: 'wrong-legacy',
          value: new VersionedCipher({ legacy: randomBytes(32) }).encrypt('x'),
        },
      ],
      withCurrent,
      save,
    );

    expect(report).toEqual({
      upgraded: [],
      missingKey: [],
      unreadableCurrent: ['wrong-current'],
      unreadableLegacy: ['wrong-legacy'],
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('reports v2 values as missingKey when no current key is configured', async () => {
    const report = await upgradeEncryptedValues(
      [{ id: 'a', value: withCurrent.encrypt('secret') }],
      legacyOnly,
      jest.fn(),
    );

    expect(report.missingKey).toEqual(['a']);
  });
});
