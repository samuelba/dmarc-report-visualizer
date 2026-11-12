import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { IsNull, Not, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import {
  deriveEncryptionKey,
  VersionedCipher,
} from '../../../common/crypto/versioned-cipher';
import { upgradeEncryptedValues } from '../../../common/crypto/upgrade-encrypted-values';

export const TOTP_ENCRYPTION_KEY_MIN_LENGTH = 32;

const RESET_HINT =
  'See docs/SECRETS.md for how to reset 2FA for affected users.';

/**
 * Build the cipher for stored TOTP secrets. Without TOTP_ENCRYPTION_KEY it
 * keeps the original key derived from JWT_SECRET, so nothing changes until an
 * operator opts in.
 * @throws Error if TOTP_ENCRYPTION_KEY is set but unusable
 */
export function createTotpCipher(
  jwtSecret: string,
  totpEncryptionKey: string | undefined,
): VersionedCipher {
  const legacy = createHash('sha256').update(jwtSecret).digest();

  if (!totpEncryptionKey) {
    return new VersionedCipher({ legacy });
  }
  if (totpEncryptionKey.length < TOTP_ENCRYPTION_KEY_MIN_LENGTH) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY must be at least ${TOTP_ENCRYPTION_KEY_MIN_LENGTH} characters. Generate one with: openssl rand -base64 48`,
    );
  }
  if (totpEncryptionKey === jwtSecret) {
    throw new Error(
      'TOTP_ENCRYPTION_KEY must differ from JWT_SECRET, otherwise rotating JWT_SECRET still breaks 2FA.',
    );
  }

  return new VersionedCipher({
    legacy,
    current: deriveEncryptionKey(totpEncryptionKey, 'totp-secret'),
  });
}

/**
 * Verify that every stored TOTP secret can be decrypted, and move the ones
 * still under the JWT_SECRET-derived key to TOTP_ENCRYPTION_KEY.
 * @throws Error if 2FA secrets exist that the configured keys cannot read, so
 *   the backend stops instead of locking those users out
 */
export async function prepareStoredTotpSecrets(
  userRepository: Repository<User>,
  cipher: VersionedCipher,
  logger: Logger,
): Promise<void> {
  const users = await userRepository.find({
    select: { id: true, totpSecret: true },
    where: { totpSecret: Not(IsNull()) },
  });

  const report = await upgradeEncryptedValues(
    users.map((user) => ({ id: user.id, value: user.totpSecret as string })),
    cipher,
    async (id, oldValue, newValue) => {
      const result = await userRepository.update(
        { id, totpSecret: oldValue },
        { totpSecret: newValue },
      );
      return result.affected === 1;
    },
  );

  if (report.missingKey.length > 0) {
    throw new Error(
      `${report.missingKey.length} stored 2FA secret(s) are encrypted with TOTP_ENCRYPTION_KEY, but it is not set. Set it to the value used before; without it these users cannot sign in.`,
    );
  }
  if (report.unreadableCurrent.length > 0) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY does not match the key used for ${report.unreadableCurrent.length} stored 2FA secret(s). Set it to the value used before; without it these users cannot sign in.`,
    );
  }
  if (report.unreadableLegacy.length > 0) {
    logger.error(
      `${report.unreadableLegacy.length} stored 2FA secret(s) cannot be decrypted with the key derived from JWT_SECRET (was JWT_SECRET changed?). Those users cannot complete 2FA. ${RESET_HINT}`,
    );
  }
  if (report.upgraded.length > 0) {
    logger.log(
      `Re-encrypted ${report.upgraded.length} stored 2FA secret(s) with TOTP_ENCRYPTION_KEY`,
    );
  }
  if (!cipher.hasCurrentKey) {
    logger.warn(
      'TOTP_ENCRYPTION_KEY is not set, so 2FA secrets are encrypted with a key derived from JWT_SECRET and changing JWT_SECRET would break 2FA. Set TOTP_ENCRYPTION_KEY (openssl rand -base64 48) to decouple them; existing secrets are re-encrypted on the next start.',
    );
  }
}
