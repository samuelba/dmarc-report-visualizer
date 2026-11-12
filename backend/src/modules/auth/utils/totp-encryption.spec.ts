import { Logger } from '@nestjs/common';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { createTotpCipher, prepareStoredTotpSecrets } from './totp-encryption';

const JWT_SECRET = 'jwt-secret-at-least-32-characters-long';
const TOTP_KEY = 'totp-key-at-least-32-characters-long!!';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

/** The exact algorithm TotpService used before TOTP_ENCRYPTION_KEY existed */
function encryptLikeBefore(secret: string, jwtSecret: string): string {
  const key = createHash('sha256').update(jwtSecret).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

describe('createTotpCipher', () => {
  it.each([
    ['without TOTP_ENCRYPTION_KEY', undefined],
    ['with an empty TOTP_ENCRYPTION_KEY', ''],
    ['with TOTP_ENCRYPTION_KEY', TOTP_KEY],
  ])('decrypts secrets stored before this change %s', (_label, totpKey) => {
    const stored = encryptLikeBefore(TOTP_SECRET, JWT_SECRET);

    expect(createTotpCipher(JWT_SECRET, totpKey).decrypt(stored)).toBe(
      TOTP_SECRET,
    );
  });

  it('keeps writing the original format without TOTP_ENCRYPTION_KEY', () => {
    const cipher = createTotpCipher(JWT_SECRET, undefined);

    expect(cipher.hasCurrentKey).toBe(false);
    expect(cipher.isCurrentFormat(cipher.encrypt(TOTP_SECRET))).toBe(false);
  });

  it('makes secrets independent of JWT_SECRET once TOTP_ENCRYPTION_KEY is set', () => {
    const stored = createTotpCipher(JWT_SECRET, TOTP_KEY).encrypt(TOTP_SECRET);
    const afterJwtRotation = createTotpCipher(
      'a-completely-new-jwt-secret-of-enough-length',
      TOTP_KEY,
    );

    expect(afterJwtRotation.decrypt(stored)).toBe(TOTP_SECRET);
  });

  it('rejects a short TOTP_ENCRYPTION_KEY', () => {
    expect(() => createTotpCipher(JWT_SECRET, 'short')).toThrow(
      'at least 32 characters',
    );
  });

  it('rejects TOTP_ENCRYPTION_KEY equal to JWT_SECRET', () => {
    expect(() => createTotpCipher(JWT_SECRET, JWT_SECRET)).toThrow(
      'must differ from JWT_SECRET',
    );
  });
});

describe('prepareStoredTotpSecrets', () => {
  let rows: Array<{ id: string; totpSecret: string }>;
  let repository: { find: jest.Mock; update: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    rows = [];
    repository = {
      find: jest.fn(() => Promise.resolve(rows)),
      update: jest.fn(() => Promise.resolve({ affected: 1 })),
    };
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  });

  const run = (totpKey: string | undefined, jwtSecret = JWT_SECRET) =>
    prepareStoredTotpSecrets(
      repository as unknown as Repository<User>,
      createTotpCipher(jwtSecret, totpKey),
      logger as unknown as Logger,
    );

  it('re-encrypts existing secrets once TOTP_ENCRYPTION_KEY is set', async () => {
    const stored = encryptLikeBefore(TOTP_SECRET, JWT_SECRET);
    rows = [{ id: 'u1', totpSecret: stored }];

    await run(TOTP_KEY);

    expect(repository.update).toHaveBeenCalledTimes(1);
    const [criteria, changes] = repository.update.mock.calls[0] as [
      unknown,
      { totpSecret: string },
    ];
    expect(criteria).toEqual({ id: 'u1', totpSecret: stored });
    expect(changes.totpSecret.startsWith('v2:')).toBe(true);
    expect(
      createTotpCipher(JWT_SECRET, TOTP_KEY).decrypt(changes.totpSecret),
    ).toBe(TOTP_SECRET);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Re-encrypted 1 stored 2FA secret'),
    );
  });

  it('changes nothing and warns when TOTP_ENCRYPTION_KEY is not set', async () => {
    rows = [
      { id: 'u1', totpSecret: encryptLikeBefore(TOTP_SECRET, JWT_SECRET) },
    ];

    await run(undefined);

    expect(repository.update).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('TOTP_ENCRYPTION_KEY is not set'),
    );
  });

  it('refuses to start when re-encrypted secrets exist but the key was removed', async () => {
    rows = [
      {
        id: 'u1',
        totpSecret: createTotpCipher(JWT_SECRET, TOTP_KEY).encrypt(TOTP_SECRET),
      },
    ];

    await expect(run(undefined)).rejects.toThrow(
      'encrypted with TOTP_ENCRYPTION_KEY, but it is not set',
    );
  });

  it('refuses to start when TOTP_ENCRYPTION_KEY was changed', async () => {
    rows = [
      {
        id: 'u1',
        totpSecret: createTotpCipher(JWT_SECRET, TOTP_KEY).encrypt(TOTP_SECRET),
      },
    ];

    await expect(
      run('a-different-totp-key-of-at-least-32-chars'),
    ).rejects.toThrow('TOTP_ENCRYPTION_KEY does not match');
  });

  it('logs, but starts, when old secrets are already unreadable after a JWT_SECRET change', async () => {
    rows = [
      { id: 'u1', totpSecret: encryptLikeBefore(TOTP_SECRET, JWT_SECRET) },
    ];

    await run(TOTP_KEY, 'a-completely-new-jwt-secret-of-enough-length');

    expect(repository.update).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'cannot be decrypted with the key derived from JWT_SECRET',
      ),
    );
  });
});
