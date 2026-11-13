import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const CURRENT_PREFIX = 'v2:';

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super('Value is encrypted with a key that is not configured');
    this.name = 'MissingEncryptionKeyError';
  }
}

/**
 * Derive a 32-byte AES key for one purpose from an operator-provided secret.
 */
export function deriveEncryptionKey(secret: string, purpose: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', secret, '', `dmarc:enc:${purpose}`, KEY_LENGTH),
  );
}

function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted =
    cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted}`;
}

function open(payload: string, key: Buffer): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
}

export interface CipherKeys {
  /** Key for values written before versioning (`iv:tag:data`) */
  readonly legacy: Buffer;
  /** Key for `v2:` values; when absent, new values are written in the legacy format */
  readonly current?: Buffer;
}

/**
 * AES-256-GCM with a format marker, so stored values can move to a new key
 * without breaking the ones not yet re-encrypted. Legacy values are pure hex
 * and colons, so they can never start with the `v2:` prefix.
 */
export class VersionedCipher {
  constructor(private readonly keys: CipherKeys) {}

  get hasCurrentKey(): boolean {
    return this.keys.current !== undefined;
  }

  isCurrentFormat(payload: string): boolean {
    return payload.startsWith(CURRENT_PREFIX);
  }

  needsUpgrade(payload: string): boolean {
    return this.hasCurrentKey && !this.isCurrentFormat(payload);
  }

  encrypt(plaintext: string): string {
    return this.keys.current
      ? `${CURRENT_PREFIX}${seal(plaintext, this.keys.current)}`
      : seal(plaintext, this.keys.legacy);
  }

  /**
   * @throws MissingEncryptionKeyError for a `v2:` value without a current key
   * @throws Error if the value is malformed or was encrypted with another key
   */
  decrypt(payload: string): string {
    if (!this.isCurrentFormat(payload)) {
      return open(payload, this.keys.legacy);
    }
    if (!this.keys.current) {
      throw new MissingEncryptionKeyError();
    }
    return open(payload.slice(CURRENT_PREFIX.length), this.keys.current);
  }
}
