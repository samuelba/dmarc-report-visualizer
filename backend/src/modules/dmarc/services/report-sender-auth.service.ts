import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Domain } from '../entities/domain.entity';
import { ReportTooLargeError } from '../config/report-limits.config';
import {
  getSenderAuthConfig,
  SenderAuthConfig,
} from '../config/sender-auth.config';
import { DeliverySource, ReportProvenance } from '../utils/report-provenance';
import { TrustedReporterService } from './trusted-reporter.service';
import {
  authenticateMessage,
  DnsResolver,
  evaluateSender,
  MessageAuth,
  orgDomain,
} from '../utils/sender-authentication';

export const SENDER_AUTH_DNS_RESOLVER = Symbol('SENDER_AUTH_DNS_RESOLVER');

/** The report email proved no reporter identity; rejecting it is final. */
export class UnverifiedSenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnverifiedSenderError';
  }
}

/** Verification hit a transient DNS failure; the message should be retried. */
export class SenderAuthUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SenderAuthUnavailableError';
  }
}

/** What one email proves about its sender, shared by all of its reports. */
export interface MessageEvidence {
  auth: MessageAuth | null;
  sourceMessageId?: string;
}

/** Failures that will not change on retry, so the message is given up at once. */
export function isPermanentIngestError(err: unknown): boolean {
  return (
    err instanceof ReportTooLargeError || err instanceof UnverifiedSenderError
  );
}

interface ProvenanceBase {
  source: DeliverySource;
  sourceMessageId?: string;
}

const LEGACY_MODE_SETTINGS = [
  ['ENABLE_IMAP_DOWNLOADER', 'IMAP_PROCESS_INLINE'],
  ['ENABLE_GMAIL_DOWNLOADER', 'GMAIL_PROCESS_INLINE'],
] as const;

@Injectable()
export class ReportSenderAuthService implements OnModuleInit {
  private readonly logger = new Logger(ReportSenderAuthService.name);
  private readonly config: SenderAuthConfig;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Domain)
    private readonly domainRepository: Repository<Domain>,
    private readonly trustedReporters: TrustedReporterService,
    @Optional()
    @Inject(SENDER_AUTH_DNS_RESOLVER)
    private readonly resolver?: DnsResolver,
  ) {
    this.config = getSenderAuthConfig(configService);
  }

  onModuleInit(): void {
    if (this.config.mode === 'off') {
      return;
    }
    if (this.config.trustedArcSealers.size === 0) {
      this.logger.warn(
        'REPORT_TRUSTED_ARC_SEALERS is empty: reports relayed through a mailing list or ' +
          'forwarder can only verify if the reporter DKIM signature survives (e.g. set google.com for Google Groups)',
      );
    }
    if (this.config.mode !== 'enforce') {
      return;
    }
    for (const [enabledKey, inlineKey] of LEGACY_MODE_SETTINGS) {
      const enabled = this.flag(enabledKey, false);
      if (enabled && !this.flag(inlineKey, true)) {
        this.logger.warn(
          `REPORT_SENDER_AUTH=enforce has no effect for ${inlineKey}=false: ` +
            'saved attachments reach the file watcher without their email and are stored as unverified',
        );
      }
    }
  }

  async verifyMessage(raw: Buffer): Promise<MessageAuth | null> {
    if (this.config.mode === 'off') {
      return null;
    }
    return authenticateMessage(
      raw,
      this.config.trustedArcSealers,
      this.resolver,
    );
  }

  /**
   * Turns message evidence into the provenance stored with one report of
   * that message. In enforce mode an unverified report is rejected.
   */
  async assess(
    auth: MessageAuth | null,
    reportEmail: string | undefined,
    base: ProvenanceBase,
  ): Promise<ReportProvenance> {
    if (!auth) {
      return { ...base, authStatus: 'unverified' };
    }
    const verdict = evaluateSender(auth, reportEmail, {
      excludedOrgDomains: await this.excludedOrgDomains(),
      isTrustedPair: await this.trustedReporters.trustedPairs(),
    });

    if (verdict.authStatus === 'unverified' && this.config.mode === 'enforce') {
      const subject = `report <email>=${reportEmail ?? 'n/a'} (messageId=${base.sourceMessageId ?? 'n/a'})`;
      throw verdict.tempError
        ? new SenderAuthUnavailableError(
            `Sender verification of ${subject} failed on a DNS error; will retry`,
          )
        : new UnverifiedSenderError(
            `Rejected ${subject}: no DKIM or trusted ARC evidence from the reporter`,
          );
    }

    return {
      ...base,
      authStatus: verdict.authStatus,
      authMethod: verdict.authMethod,
      authDomain: verdict.authDomain,
      claimedDomain: verdict.claimedDomain,
      authDetails: verdict.authDetails as unknown as Record<string, unknown>,
    };
  }

  private async excludedOrgDomains(): Promise<Set<string>> {
    const managed = await this.domainRepository.find({
      select: { domain: true },
    });
    const excluded = new Set<string>();
    for (const domain of [
      ...managed.map((d) => d.domain),
      ...this.config.relayDomains,
    ]) {
      const org = orgDomain(domain);
      if (org) {
        excluded.add(org);
      }
    }
    return excluded;
  }

  private flag(key: string, fallback: boolean): boolean {
    const raw = this.configService.get<string>(key);
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return fallback;
    }
    return String(raw).trim().toLowerCase() === 'true';
  }
}
