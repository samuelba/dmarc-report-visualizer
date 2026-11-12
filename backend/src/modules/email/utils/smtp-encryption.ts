import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SmtpConfig } from '../entities/smtp-config.entity';
import {
  deriveEncryptionKey,
  VersionedCipher,
} from '../../../common/crypto/versioned-cipher';
import { upgradeEncryptedValues } from '../../../common/crypto/upgrade-encrypted-values';

export const SMTP_ENCRYPTION_KEY_MIN_LENGTH = 32;

/** Values shipped in docker-compose files, .env.sample and the docs */
export const SMTP_ENCRYPTION_KEY_PUBLIC_VALUES: readonly string[] = [
  'your-smtp-encryption-key',
  'your-smtp-encryption-key-change-this-in-production',
  'your-encryption-key-here',
  'your-generated-key-here',
];

export const SMTP_PASSWORD_UNREADABLE_HINT =
  'The stored SMTP password cannot be decrypted with the current SMTP_ENCRYPTION_KEY (was the key changed?). Re-enter the password in the SMTP settings.';

/**
 * Build the cipher for the stored SMTP password. New values use a key derived
 * from SMTP_ENCRYPTION_KEY with HKDF; values written before keep decrypting
 * with the original zero-padded key.
 */
export function createSmtpCipher(smtpEncryptionKey: string): VersionedCipher {
  return new VersionedCipher({
    legacy: Buffer.from(smtpEncryptionKey.padEnd(32, '0').slice(0, 32)),
    current: deriveEncryptionKey(smtpEncryptionKey, 'smtp-password'),
  });
}

/**
 * @returns A description of why the key is unsafe, or null if it looks fine
 */
export function findSmtpKeyWeakness(smtpEncryptionKey: string): string | null {
  if (SMTP_ENCRYPTION_KEY_PUBLIC_VALUES.includes(smtpEncryptionKey)) {
    return 'SMTP_ENCRYPTION_KEY is a publicly known example value, so the stored SMTP password is effectively unencrypted.';
  }
  if (smtpEncryptionKey.length < SMTP_ENCRYPTION_KEY_MIN_LENGTH) {
    return `SMTP_ENCRYPTION_KEY is shorter than ${SMTP_ENCRYPTION_KEY_MIN_LENGTH} characters.`;
  }
  return null;
}

/**
 * Re-encrypt a stored SMTP password still in the legacy format, and report
 * one that cannot be decrypted. Never blocks startup: an admin can re-enter
 * the password.
 */
export async function prepareStoredSmtpPassword(
  smtpConfigRepository: Repository<SmtpConfig>,
  cipher: VersionedCipher,
  logger: Logger,
): Promise<void> {
  const configs = await smtpConfigRepository.find({
    select: { id: true, encryptedPassword: true },
  });

  const report = await upgradeEncryptedValues(
    configs
      .filter((config) => config.encryptedPassword)
      .map((config) => ({
        id: config.id,
        value: config.encryptedPassword as string,
      })),
    cipher,
    async (id, oldValue, newValue) => {
      const result = await smtpConfigRepository.update(
        { id, encryptedPassword: oldValue },
        { encryptedPassword: newValue },
      );
      return result.affected === 1;
    },
  );

  if (report.unreadableCurrent.length + report.unreadableLegacy.length > 0) {
    logger.error(SMTP_PASSWORD_UNREADABLE_HINT);
  }
  if (report.upgraded.length > 0) {
    logger.log('Re-encrypted the stored SMTP password with the derived key');
  }
}
