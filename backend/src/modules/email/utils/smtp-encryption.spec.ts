import { Logger } from '@nestjs/common';
import { createCipheriv, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { SmtpConfig } from '../entities/smtp-config.entity';
import {
  createSmtpCipher,
  findSmtpKeyWeakness,
  prepareStoredSmtpPassword,
  SMTP_ENCRYPTION_KEY_PUBLIC_VALUES,
} from './smtp-encryption';

const SMTP_KEY = 'smtp-key-at-least-32-characters-long!!';

/** The exact algorithm SmtpConfigService used before the derived key */
function encryptLikeBefore(password: string, smtpKey: string): string {
  const key = Buffer.from(smtpKey.padEnd(32, '0').slice(0, 32));
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

describe('createSmtpCipher', () => {
  it.each([
    ['a long key', SMTP_KEY],
    ['the short docker-compose default', 'your-smtp-encryption-key'],
  ])('decrypts passwords stored before this change with %s', (_l, key) => {
    const stored = encryptLikeBefore('hunter2', key);

    expect(createSmtpCipher(key).decrypt(stored)).toBe('hunter2');
  });

  it('writes new passwords in the v2 format', () => {
    const cipher = createSmtpCipher(SMTP_KEY);
    const encrypted = cipher.encrypt('hunter2');

    expect(cipher.isCurrentFormat(encrypted)).toBe(true);
    expect(cipher.decrypt(encrypted)).toBe('hunter2');
  });

  it('uses the whole key, not only the first 32 characters', () => {
    const encrypted = createSmtpCipher(`${SMTP_KEY}-a`).encrypt('hunter2');

    expect(() =>
      createSmtpCipher(`${SMTP_KEY}-b`).decrypt(encrypted),
    ).toThrow();
  });
});

describe('findSmtpKeyWeakness', () => {
  it.each(SMTP_ENCRYPTION_KEY_PUBLIC_VALUES)(
    'flags the public value %s',
    (value) => {
      expect(findSmtpKeyWeakness(value)).toContain('publicly known');
    },
  );

  it('flags a short key', () => {
    expect(findSmtpKeyWeakness('short-but-private')).toContain(
      'shorter than 32',
    );
  });

  it('accepts a long private key', () => {
    expect(findSmtpKeyWeakness(SMTP_KEY)).toBeNull();
  });
});

describe('prepareStoredSmtpPassword', () => {
  let rows: Array<{ id: number; encryptedPassword: string | null }>;
  let repository: { find: jest.Mock; update: jest.Mock };
  let logger: { log: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    rows = [];
    repository = {
      find: jest.fn(() => Promise.resolve(rows)),
      update: jest.fn(() => Promise.resolve({ affected: 1 })),
    };
    logger = { log: jest.fn(), error: jest.fn() };
  });

  const run = (key = SMTP_KEY) =>
    prepareStoredSmtpPassword(
      repository as unknown as Repository<SmtpConfig>,
      createSmtpCipher(key),
      logger as unknown as Logger,
    );

  it('re-encrypts a password stored before this change', async () => {
    const stored = encryptLikeBefore('hunter2', SMTP_KEY);
    rows = [{ id: 1, encryptedPassword: stored }];

    await run();

    const [criteria, changes] = repository.update.mock.calls[0] as [
      unknown,
      { encryptedPassword: string },
    ];
    expect(criteria).toEqual({ id: 1, encryptedPassword: stored });
    expect(createSmtpCipher(SMTP_KEY).decrypt(changes.encryptedPassword)).toBe(
      'hunter2',
    );
  });

  it('does nothing without a stored password', async () => {
    rows = [{ id: 1, encryptedPassword: null }];

    await run();

    expect(repository.update).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs, but does not block startup, when the password cannot be decrypted', async () => {
    rows = [
      { id: 1, encryptedPassword: encryptLikeBefore('hunter2', SMTP_KEY) },
    ];

    await expect(
      run('another-smtp-key-at-least-32-characters'),
    ).resolves.toBeUndefined();

    expect(repository.update).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Re-enter the password'),
    );
  });
});
