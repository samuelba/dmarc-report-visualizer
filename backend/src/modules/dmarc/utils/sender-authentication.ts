import { promises as dns } from 'dns';
import { getDomain } from 'tldts';
import { authenticate } from 'mailauth';
import type { AuthenticateResult } from 'mailauth';
import { parseDkimHeaders } from 'mailauth/lib/tools';
import type { AuthMethod } from './report-provenance';

/** A domain that proved control over the message, and how. */
export interface AuthIdentity {
  domain: string;
  source: 'dkim' | 'dmarc';
  method: AuthMethod;
  /** ARC instance that recorded it, for `arc` identities. */
  instance?: number;
}

export interface ArcInstanceSummary {
  i: number;
  sealer: string;
  trusted: boolean;
  dkim: { domain: string; result: string }[];
  dmarc?: { result: string; from?: string };
}

export interface MessageAuth {
  identities: AuthIdentity[];
  dkim: { domain: string; result: string }[];
  arc: { result: string; instances: ArcInstanceSummary[] };
  /** A DNS lookup failed transiently, so a negative result may change on retry. */
  tempError: boolean;
}

export interface SenderVerdict {
  authStatus: 'aligned' | 'unaligned' | 'unverified';
  authMethod?: AuthMethod;
  authDomain?: string;
  claimedDomain?: string;
  tempError: boolean;
  authDetails: {
    dkim: MessageAuth['dkim'];
    arc: MessageAuth['arc'];
    identities: AuthIdentity[];
    matchedIdentity: AuthIdentity | null;
    excludedRelayIdentities: AuthIdentity[];
  };
}

export interface EvaluateOptions {
  /** Organizational domains that relay reports to us (managed + configured). */
  excludedOrgDomains: ReadonlySet<string>;
  /** Admin-approved (claimed org domain, exact authenticated domain) pairs. */
  isTrustedPair?: (claimedDomain: string, authDomain: string) => boolean;
}

interface ParsedAuthResult {
  value?: string;
  header?: { d?: string; i?: string; from?: string };
}

interface ArcLink {
  i: number;
  'arc-seal'?: { parsed?: { d?: { value?: string } } };
  'arc-authentication-results'?: { original?: Buffer | string };
}

export function orgDomain(domain: string | undefined | null): string | null {
  if (!domain) {
    return null;
  }
  return getDomain(normalizeDomain(domain), { allowPrivateDomains: true });
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, '');
}

function domainOfAddress(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const at = value.lastIndexOf('@');
  const domain = normalizeDomain(at >= 0 ? value.slice(at + 1) : value);
  return domain || undefined;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * mailauth mutates the parsed newest ARC-Authentication-Results, so every
 * instance is re-parsed from its original header text.
 */
function summarizeArcInstance(
  link: ArcLink,
  trustedSealers: ReadonlySet<string>,
): ArcInstanceSummary {
  const sealer = normalizeDomain(link['arc-seal']?.parsed?.d?.value ?? '');
  const original = link['arc-authentication-results']?.original;
  const parsed = original
    ? (parseDkimHeaders(String(original)).parsed as Record<string, unknown>)
    : {};
  const dkim = asArray(parsed.dkim as ParsedAuthResult[] | undefined)
    .map((entry) => ({
      domain:
        domainOfAddress(entry.header?.d) ?? domainOfAddress(entry.header?.i),
      result: String(entry.value ?? 'none').toLowerCase(),
    }))
    .filter((entry): entry is { domain: string; result: string } =>
      Boolean(entry.domain),
    );
  const dmarcEntry = asArray(parsed.dmarc as ParsedAuthResult | undefined)[0];
  return {
    i: link.i,
    sealer,
    trusted: trustedSealers.has(sealer),
    dkim,
    dmarc: dmarcEntry
      ? {
          result: String(dmarcEntry.value ?? 'none').toLowerCase(),
          from: domainOfAddress(dmarcEntry.header?.from),
        }
      : undefined,
  };
}

/**
 * Collects the identities a message proves: passing DKIM signatures on the
 * message itself, plus what trusted ARC sealers recorded on arrival. The ARC
 * walk goes newest to oldest and stops at the first untrusted sealer, since
 * anything older is only vouched for by that sealer.
 */
export function summarizeAuthentication(
  result: AuthenticateResult,
  trustedSealers: ReadonlySet<string>,
): Omit<MessageAuth, 'tempError'> {
  const dkim = (result.dkim?.results ?? []).map((r) => ({
    domain: normalizeDomain(String(r.signingDomain ?? '')),
    result: String(r.status?.result ?? 'none').toLowerCase(),
  }));
  const identities: AuthIdentity[] = dkim
    .filter((r) => r.result === 'pass' && r.domain)
    .map((r) => ({ domain: r.domain, source: 'dkim', method: 'dkim' }));

  const arc = result.arc || undefined;
  const arcResult = String(arc?.status?.result ?? 'none');
  // `chain` is a non-enumerable property mailauth leaves out of its types.
  const chain =
    (arc as unknown as { chain?: ArcLink[] | false } | undefined)?.chain || [];
  const instances = [...chain]
    .reverse()
    .map((link) => summarizeArcInstance(link, trustedSealers));

  if (arcResult === 'pass') {
    for (const instance of instances) {
      if (!instance.trusted) {
        break;
      }
      for (const entry of instance.dkim) {
        if (entry.result === 'pass') {
          identities.push({
            domain: entry.domain,
            source: 'dkim',
            method: 'arc',
            instance: instance.i,
          });
        }
      }
      if (instance.dmarc?.result === 'pass' && instance.dmarc.from) {
        identities.push({
          domain: instance.dmarc.from,
          source: 'dmarc',
          method: 'arc',
          instance: instance.i,
        });
      }
    }
  }

  return { identities, dkim, arc: { result: arcResult, instances } };
}

export type DnsResolver = (
  name: string,
  rrtype: string,
) => Promise<string[][] | string[]>;

/** Answers that are final; any other DNS failure may succeed on retry. */
const PERMANENT_DNS_CODES = new Set(['ENOTFOUND', 'ENODATA', 'ENXDOMAIN']);

/**
 * Verifies a raw message. Only DKIM and ARC are meaningful here: the SMTP
 * client IP is gone after the mailbox received it, so SPF and the
 * top-level DMARC result (which concern the last relay) are not used.
 */
export async function authenticateMessage(
  raw: Buffer,
  trustedSealers: ReadonlySet<string>,
  resolve: DnsResolver = (name, rrtype) =>
    dns.resolve(name, rrtype) as Promise<string[][] | string[]>,
): Promise<MessageAuth> {
  let tempError = false;
  const resolver: DnsResolver = async (name, rrtype) => {
    try {
      return await resolve(name, rrtype);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (!PERMANENT_DNS_CODES.has(code)) {
        tempError = true;
      }
      throw err;
    }
  };
  const result = await authenticate(raw, {
    resolver,
    disableBimi: true,
    disableDmarc: true,
  });
  return { ...summarizeAuthentication(result, trustedSealers), tempError };
}

/** DMARC-backed From identities first, then direct DKIM before ARC. */
function preference(identity: AuthIdentity): number {
  return (
    (identity.source === 'dmarc' ? 0 : 2) + (identity.method === 'dkim' ? 0 : 1)
  );
}

export function evaluateSender(
  auth: MessageAuth,
  reportEmail: string | undefined,
  options: EvaluateOptions,
): SenderVerdict {
  const claimedDomain = orgDomain(domainOfAddress(reportEmail)) ?? undefined;
  const usable: AuthIdentity[] = [];
  const excluded: AuthIdentity[] = [];
  for (const identity of auth.identities) {
    const org = orgDomain(identity.domain);
    if (!org || options.excludedOrgDomains.has(org)) {
      excluded.push(identity);
    } else {
      usable.push(identity);
    }
  }
  const ranked = [...usable].sort((a, b) => preference(a) - preference(b));

  const matched =
    (claimedDomain &&
      (ranked.find((id) => orgDomain(id.domain) === claimedDomain) ??
        ranked.find((id) =>
          options.isTrustedPair?.(claimedDomain, id.domain),
        ))) ||
    null;
  const primary = matched ?? ranked[0] ?? null;

  const details: SenderVerdict['authDetails'] = {
    dkim: auth.dkim,
    arc: auth.arc,
    identities: auth.identities,
    matchedIdentity: matched,
    excludedRelayIdentities: excluded,
  };

  if (!primary) {
    return {
      authStatus: 'unverified',
      claimedDomain,
      tempError: auth.tempError,
      authDetails: details,
    };
  }
  return {
    authStatus: matched ? 'aligned' : 'unaligned',
    authMethod: primary.method,
    authDomain: primary.domain,
    claimedDomain,
    tempError: false,
    authDetails: details,
  };
}
