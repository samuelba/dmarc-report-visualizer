export type AuthStatus =
  'aligned' | 'unaligned' | 'manual' | 'unverified' | 'legacy';

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

const AUTH_RANK: Record<AuthStatus, number> = {
  aligned: 3,
  unaligned: 2,
  manual: 2,
  unverified: 1,
  legacy: 1,
};

export function rankOf(status: AuthStatus): number {
  return AUTH_RANK[status];
}

interface ComparableCopy {
  authStatus: AuthStatus;
  contentHash: string | null;
}

/**
 * Decides what happens when an incoming report has the same
 * (reportId, orgName, email) key as a stored one. Only a strictly
 * higher-ranked copy may replace the stored data.
 */
export function decideCollision(
  existing: ComparableCopy,
  incoming: ComparableCopy,
): CollisionOutcome {
  if (existing.contentHash && existing.contentHash === incoming.contentHash) {
    return 'duplicate';
  }
  return rankOf(incoming.authStatus) > rankOf(existing.authStatus)
    ? 'replaced'
    : 'conflict';
}
