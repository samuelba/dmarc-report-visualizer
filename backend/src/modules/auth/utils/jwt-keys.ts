import { hkdfSync } from 'crypto';
import { TokenType } from '../interfaces/jwt-payload.interface';

export const JWT_ALGORITHM = 'HS256';
export const JWT_SECRET_SAMPLE_VALUE =
  'your-secret-key-change-this-in-production';
export const JWT_SECRET_MIN_LENGTH = 32;

const DERIVED_KEY_LENGTH = 32;

export function requireJwtSecret(secret: string | undefined): string {
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

/**
 * Derive a dedicated signing key per token type from JWT_SECRET, so a token
 * of one type fails signature verification wherever another type is expected.
 */
export function deriveTokenKey(secret: string, type: TokenType): Buffer {
  return Buffer.from(
    hkdfSync('sha256', secret, '', `dmarc:jwt:${type}`, DERIVED_KEY_LENGTH),
  );
}

/**
 * @returns A description of why the secret is unsafe, or null if it looks fine
 */
export function findJwtSecretWeakness(secret: string): string | null {
  if (secret === JWT_SECRET_SAMPLE_VALUE) {
    return 'JWT_SECRET is still the example value from .env.sample. Anyone who knows it can sign in as any user.';
  }
  if (secret.length < JWT_SECRET_MIN_LENGTH) {
    return `JWT_SECRET is shorter than ${JWT_SECRET_MIN_LENGTH} characters and can be brute-forced from any issued token.`;
  }
  return null;
}
