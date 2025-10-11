import { Injectable, Logger } from '@nestjs/common';
import { DmarcRecord } from '../entities/dmarc-record.entity';
import { DkimResult } from '../entities/dkim-result.entity';
import { SpfResult } from '../entities/spf-result.entity';
import { PolicyOverrideReason } from '../entities/policy-override-reason.entity';
import { ThirdPartySenderService } from './third-party-sender.service';

export interface ForwardingDetectionResult {
  isForwarded: boolean | null;
  reason: string | null;
}

@Injectable()
export class ForwardingDetectionService {
  private readonly logger = new Logger(ForwardingDetectionService.name);

  constructor(
    private readonly thirdPartySenderService: ThirdPartySenderService,
  ) {}

  /**
   * Detects if a DMARC record represents a forwarded email based on:
   * 1. Policy override reasons explicitly marking it as forwarded
   * 2. MUST have DKIM from headerFrom domain (pass or fail)
   * 3. MUST have additional DKIM/SPF from different domain (forwarder)
   * 4. MUST NOT match third-party sender patterns (SendGrid, Mailgun, etc.)
   *
   * If these conditions aren't met, it's either NOT forwarded or Unknown.
   */
  async detectForwarding(
    record: Partial<DmarcRecord> & {
      dkimResults?: Partial<DkimResult>[];
      spfResults?: Partial<SpfResult>[];
      policyOverrideReasons?: Partial<PolicyOverrideReason>[];
    },
  ): Promise<ForwardingDetectionResult> {
    try {
      // Priority 1: Check if explicitly marked as forwarded in policy override reasons
      if (
        record.policyOverrideReasons &&
        record.policyOverrideReasons.length > 0
      ) {
        for (const reason of record.policyOverrideReasons) {
          if (reason.type === 'forwarded') {
            return {
              isForwarded: true,
              reason: reason.comment
                ? `Explicitly marked as forwarded by recipient's mail server: ${reason.comment}`
                : "Explicitly marked as forwarded by recipient's mail server",
            };
          }
        }
      }

      const headerFrom = record.headerFrom;
      const dkimResults = record.dkimResults || [];
      const spfResults = record.spfResults || [];

      // Priority 2: Check if we have enough data to make a determination
      if (!headerFrom) {
        return {
          isForwarded: null,
          reason: null,
        };
      }

      const headerFromBase = this.extractBaseDomain(headerFrom);

      // Priority 3: Check third-party senders FIRST (before other analysis)
      // If ANY DKIM/SPF domain matches third-party patterns, it's NOT a forwarder
      const dkimDomains = dkimResults
        .map((dkim) => dkim.domain)
        .filter((d): d is string => !!d);

      for (const dkimDomain of dkimDomains) {
        const { isThirdParty } =
          await this.thirdPartySenderService.isDkimThirdParty(dkimDomain);
        if (isThirdParty) {
          // This is a legitimate third-party sender, not a forwarder
          return {
            isForwarded: false,
            reason: null,
          };
        }
      }

      // Check if any SPF domains are third-party senders
      for (const spf of spfResults) {
        if (spf.domain) {
          const { isThirdParty } =
            await this.thirdPartySenderService.isSpfThirdParty(spf.domain);
          if (isThirdParty) {
            // This is a legitimate third-party sender, not a forwarder
            return {
              isForwarded: false,
              reason: null,
            };
          }
        }
      }

      // Priority 4: Check for forwarding pattern
      // REQUIRED: DKIM result from headerFrom domain (original sender)
      const originalDkimResults = dkimResults.filter((dkim) => {
        if (!dkim.domain) return false;
        return this.extractBaseDomain(dkim.domain) === headerFromBase;
      });

      // Check for DKIM/SPF from different domains (potential forwarders)
      const forwarderDkimResults = dkimResults.filter((dkim) => {
        if (!dkim.domain) return false;
        return this.extractBaseDomain(dkim.domain) !== headerFromBase;
      });

      const forwarderSpfResults = spfResults.filter((spf) => {
        if (!spf.domain) return false;
        return this.extractBaseDomain(spf.domain) !== headerFromBase;
      });

      // FORWARDING DETECTION: Must have original DKIM + forwarder DKIM/SPF
      if (
        originalDkimResults.length > 0 &&
        (forwarderDkimResults.length > 0 || forwarderSpfResults.length > 0)
      ) {
        // We have DKIM from original domain AND additional auth from different domain
        // This is the forwarding pattern!

        const originalFailed = originalDkimResults.every(
          (dkim) => dkim.result === 'fail',
        );
        const originalPassed = originalDkimResults.some(
          (dkim) => dkim.result === 'pass',
        );
        const forwarderDkimPassed = forwarderDkimResults.some(
          (dkim) => dkim.result === 'pass',
        );
        const forwarderSpfPassed = forwarderSpfResults.some(
          (spf) => spf.result === 'pass',
        );

        if (originalFailed && (forwarderDkimPassed || forwarderSpfPassed)) {
          // Original DKIM failed (email was modified), forwarder authenticated it
          const forwarderDomain =
            forwarderDkimResults.find((dkim) => dkim.result === 'pass')
              ?.domain ||
            forwarderSpfResults.find((spf) => spf.result === 'pass')?.domain;
          return {
            isForwarded: true,
            reason: `Email forwarded with modifications (original DKIM signature broken, authenticated by forwarder: ${forwarderDomain})`,
          };
        }

        if (originalPassed && (forwarderDkimPassed || forwarderSpfPassed)) {
          // Original DKIM passed (email NOT modified), forwarder also authenticated it
          const forwarderDomain =
            forwarderDkimResults.find((dkim) => dkim.result === 'pass')
              ?.domain ||
            forwarderSpfResults.find((spf) => spf.result === 'pass')?.domain;
          return {
            isForwarded: true,
            reason: `Email forwarded without modifications (original DKIM signature preserved, authenticated by forwarder: ${forwarderDomain})`,
          };
        }

        // Check if forwarder is a known forwarding service (even if auth didn't pass)
        const knownForwarder = forwarderDkimResults.find((dkim) =>
          this.isKnownForwarder(dkim.domain || ''),
        );
        if (knownForwarder) {
          return {
            isForwarded: true,
            reason: `Email forwarded by known forwarding service: ${knownForwarder.domain}`,
          };
        }

        // We have original + forwarder domains but auth results are unclear
        // Still likely forwarded
        return {
          isForwarded: true,
          reason:
            'Email likely forwarded (DKIM from both original and forwarding domains detected)',
        };
      }

      // NOT FORWARDING CASES:

      // Case 1: Only DKIM from headerFrom domain (no forwarder)
      if (
        originalDkimResults.length > 0 &&
        forwarderDkimResults.length === 0 &&
        forwarderSpfResults.length === 0
      ) {
        return {
          isForwarded: false,
          reason: null,
        };
      }

      // Case 2: Only DKIM/SPF from non-headerFrom domains (no original DKIM)
      // This is authentication failure (spam/spoofing), NOT forwarding
      if (
        originalDkimResults.length === 0 &&
        (dkimResults.length > 0 || spfResults.length > 0)
      ) {
        return {
          isForwarded: false,
          reason: null,
        };
      }

      // Case 3: No DKIM at all, only SPF
      if (dkimResults.length === 0 && spfResults.length > 0) {
        return {
          isForwarded: false,
          reason: null,
        };
      }

      // Priority 5: Cannot determine with confidence
      return {
        isForwarded: null,
        reason: null,
      };
    } catch (error) {
      this.logger.error(
        `Error detecting forwarding: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        isForwarded: null,
        reason: null,
      };
    }
  }

  /**
   * Extracts the base domain from a full domain or subdomain
   * Examples:
   * - anybotics.com -> anybotics.com
   * - id.anybotics.com -> anybotics.com
   * - mail.google.com -> google.com
   * - OxfordSciences.onmicrosoft.com -> onmicrosoft.com
   */
  private extractBaseDomain(domain: string): string {
    if (!domain) return '';

    // Remove any whitespace and convert to lowercase
    const cleanDomain = domain.trim().toLowerCase();

    // Split by dots
    const parts = cleanDomain.split('.');

    // Handle special cases for multi-part TLDs (e.g., .co.uk, .com.au)
    // For simplicity, we'll just take the last two parts for most cases
    // This works for .com, .org, .net, etc.
    if (parts.length >= 2) {
      // Special handling for common multi-part TLDs
      if (
        parts.length >= 3 &&
        ['co', 'com', 'org', 'net', 'ac', 'gov'].includes(
          parts[parts.length - 2],
        )
      ) {
        // Return last 3 parts (e.g., domain.co.uk)
        return parts.slice(-3).join('.');
      }
      // Return last 2 parts (e.g., domain.com)
      return parts.slice(-2).join('.');
    }

    return cleanDomain;
  }

  /**
   * Checks if a domain is from a known email forwarding service
   */
  private isKnownForwarder(domain: string): boolean {
    if (!domain) return false;

    const lowerDomain = domain.toLowerCase();

    // List of known forwarder patterns
    const knownForwarderPatterns = [
      'onmicrosoft.com', // Microsoft 365 forwarding
      'fwd.privateemail.com', // PrivateEmail forwarding
      'forward',
      'relay',
      'mail-forwarding',
      'forwardemail',
      'improvmx.com', // ImprovMX forwarding service
      'mailgun.', // Mailgun
      'sendgrid.', // SendGrid
      'amazonses.com', // Amazon SES
    ];

    return knownForwarderPatterns.some((pattern) =>
      lowerDomain.includes(pattern),
    );
  }
}
