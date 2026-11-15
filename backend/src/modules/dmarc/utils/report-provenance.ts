export type AuthStatus =
  'aligned' | 'unaligned' | 'manual' | 'unverified' | 'unchecked' | 'legacy';

export type AuthMethod = 'dkim' | 'arc';

export type DeliverySource = 'imap' | 'gmail' | 'upload' | 'directory' | 'file';

export type CollisionOutcome = 'duplicate' | 'replaced' | 'conflict';

export type DeliveryOutcome = 'created' | CollisionOutcome;

export interface ReportProvenance {
  source: DeliverySource;
  authStatus: Exclude<AuthStatus, 'legacy'>;
  authMethod?: AuthMethod;
  authDomain?: string;
  claimedDomain?: string;
  sourceMessageId?: string;
  authDetails?: Record<string, unknown>;
}

interface ComparableCopy {
  authStatus: AuthStatus;
  contentHash: string | null;
}

/**
 * Decides what happens when an incoming report has the same
 * (reportId, orgName, email) key as a stored one. Only a copy proven to come
 * from the claimed organization (aligned) may replace stored data, and only
 * data that is not itself aligned. An unaligned copy proves who sent it, not
 * that it owns the report it claims.
 */
export function decideCollision(
  existing: ComparableCopy,
  incoming: ComparableCopy,
): CollisionOutcome {
  if (existing.contentHash && existing.contentHash === incoming.contentHash) {
    return 'duplicate';
  }
  return incoming.authStatus === 'aligned' && existing.authStatus !== 'aligned'
    ? 'replaced'
    : 'conflict';
}
