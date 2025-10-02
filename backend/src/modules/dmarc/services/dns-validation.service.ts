import { Injectable, Logger } from '@nestjs/common';
import { promises as dns } from 'dns';

export interface DnsValidationResult {
  domain: string;
  dmarc: {
    exists: boolean;
    record?: string;
    policy?: 'none' | 'quarantine' | 'reject';
    issues: string[];
  };
  spf: {
    exists: boolean;
    record?: string;
    mechanisms: string[];
    issues: string[];
  };
  dkim: {
    // DKIM is more complex as it requires knowing the selector
    // We'll check for common selectors and DMARC policy
    commonSelectorsChecked: string[];
    foundSelectors: Array<{ selector: string; record: string }>;
    issues: string[];
  };
  overall: {
    severity: 'good' | 'warning' | 'critical';
    summary: string;
    recommendations: string[];
  };
}

@Injectable()
export class DnsValidationService {
  private readonly logger = new Logger(DnsValidationService.name);

  // Common DKIM selectors to check
  private readonly commonDkimSelectors = [
    'default',
    'selector1',
    'selector2',
    'google',
    'k1',
    'dkim',
    's1',
    's2',
    'mail',
    'email',
    'mx',
    'key1',
    'key2',
  ];

  async validateDomain(domain: string): Promise<DnsValidationResult> {
    const result: DnsValidationResult = {
      domain,
      dmarc: { exists: false, issues: [] },
      spf: { exists: false, mechanisms: [], issues: [] },
      dkim: {
        commonSelectorsChecked: this.commonDkimSelectors,
        foundSelectors: [],
        issues: [],
      },
      overall: { severity: 'critical', summary: '', recommendations: [] },
    };

    try {
      // Check DMARC record
      await this.checkDmarcRecord(domain, result);

      // Check SPF record
      await this.checkSpfRecord(domain, result);

      // Check DKIM records (common selectors)
      await this.checkDkimRecords(domain, result);

      // Analyze overall status
      this.analyzeOverallStatus(result);
    } catch (error) {
      this.logger.error(`DNS validation failed for domain ${domain}:`, error);
      result.overall.severity = 'critical';
      result.overall.summary = 'DNS validation failed';
      result.overall.recommendations.push(
        'Unable to validate DNS records - check domain accessibility',
      );
    }

    return result;
  }

  private async checkDmarcRecord(
    domain: string,
    result: DnsValidationResult,
  ): Promise<void> {
    try {
      const dmarcDomain = `_dmarc.${domain}`;
      const records = await dns.resolveTxt(dmarcDomain);

      for (const record of records) {
        const recordText = Array.isArray(record) ? record.join('') : record;
        if (recordText.startsWith('v=DMARC1')) {
          result.dmarc.exists = true;
          result.dmarc.record = recordText;

          // Parse policy
          const policyMatch = recordText.match(/p=([^;]+)/);
          if (policyMatch) {
            result.dmarc.policy = policyMatch[1] as
              | 'none'
              | 'quarantine'
              | 'reject';
          }

          // Check for common issues
          if (result.dmarc.policy === 'none') {
            result.dmarc.issues.push(
              'DMARC policy is set to "none" - consider upgrading to "quarantine" or "reject"',
            );
          }

          if (!recordText.includes('rua=')) {
            result.dmarc.issues.push(
              'No aggregate reporting address (rua) configured',
            );
          }

          break;
        }
      }

      if (!result.dmarc.exists) {
        result.dmarc.issues.push(
          'No DMARC record found - add a DMARC policy to _dmarc.' + domain,
        );
      }
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
        result.dmarc.issues.push(
          'No DMARC record found - add a DMARC policy to _dmarc.' + domain,
        );
      } else {
        result.dmarc.issues.push(`DMARC lookup failed: ${error.message}`);
      }
    }
  }

  private async checkSpfRecord(
    domain: string,
    result: DnsValidationResult,
  ): Promise<void> {
    try {
      const records = await dns.resolveTxt(domain);

      for (const record of records) {
        const recordText = Array.isArray(record) ? record.join('') : record;
        if (recordText.startsWith('v=spf1')) {
          result.spf.exists = true;
          result.spf.record = recordText;

          // Parse mechanisms
          const mechanisms = recordText.split(' ').slice(1); // Skip 'v=spf1'
          result.spf.mechanisms = mechanisms;

          // Check for common issues
          if (recordText.includes('~all')) {
            // Soft fail is okay but could be stronger
          } else if (recordText.includes('-all')) {
            // Hard fail is good
          } else if (recordText.includes('+all')) {
            result.spf.issues.push(
              'SPF record ends with "+all" which allows any sender - very insecure',
            );
          } else if (!recordText.includes('all')) {
            result.spf.issues.push(
              'SPF record should end with an "all" mechanism',
            );
          }

          // Check for too many DNS lookups (SPF has a 10 lookup limit)
          const lookupMechanisms = mechanisms.filter(
            (m) =>
              m.startsWith('include:') ||
              m.startsWith('a:') ||
              m.startsWith('mx:') ||
              m.startsWith('exists:') ||
              m.startsWith('redirect='),
          );
          if (lookupMechanisms.length > 8) {
            result.spf.issues.push(
              `SPF record may exceed DNS lookup limit (${lookupMechanisms.length} lookups found, 10 max)`,
            );
          }

          break;
        }
      }

      if (!result.spf.exists) {
        result.spf.issues.push(
          'No SPF record found - add an SPF record to authorize sending servers',
        );
      }
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
        result.spf.issues.push(
          'No SPF record found - add an SPF record to authorize sending servers',
        );
      } else {
        result.spf.issues.push(`SPF lookup failed: ${error.message}`);
      }
    }
  }

  private async checkDkimRecords(
    domain: string,
    result: DnsValidationResult,
  ): Promise<void> {
    const promises = this.commonDkimSelectors.map(async (selector) => {
      try {
        const dkimDomain = `${selector}._domainkey.${domain}`;
        const records = await dns.resolveTxt(dkimDomain);

        for (const record of records) {
          const recordText = Array.isArray(record) ? record.join('') : record;
          if (
            recordText.includes('v=DKIM1') ||
            recordText.includes('k=rsa') ||
            recordText.includes('p=')
          ) {
            result.dkim.foundSelectors.push({ selector, record: recordText });

            // Check for common DKIM issues
            if (recordText.includes('t=y')) {
              result.dkim.issues.push(
                `DKIM selector "${selector}" is in test mode (t=y) - remove for production`,
              );
            }

            if (
              !recordText.includes('p=') ||
              recordText.includes('p=;') ||
              recordText.includes('p=""')
            ) {
              result.dkim.issues.push(
                `DKIM selector "${selector}" has no public key - key may be revoked`,
              );
            }
          }
        }
      } catch (error) {
        // Selector not found is normal, don't log as error
      }
    });

    await Promise.all(promises);

    if (result.dkim.foundSelectors.length === 0) {
      result.dkim.issues.push(
        `No DKIM records found for common selectors (${this.commonDkimSelectors.join(', ')}) - configure DKIM signing`,
      );
    }
  }

  private analyzeOverallStatus(result: DnsValidationResult): void {
    const totalIssues =
      result.dmarc.issues.length +
      result.spf.issues.length +
      result.dkim.issues.length;
    const criticalIssues = [
      !result.dmarc.exists,
      !result.spf.exists,
      result.dkim.foundSelectors.length === 0,
      result.spf.record?.includes('+all'),
    ].filter(Boolean).length;

    if (criticalIssues === 0 && totalIssues === 0) {
      result.overall.severity = 'good';
      result.overall.summary =
        'All email authentication records are properly configured';
    } else if (criticalIssues === 0) {
      result.overall.severity = 'warning';
      result.overall.summary = `Email authentication is configured but has ${totalIssues} optimization opportunities`;
    } else {
      result.overall.severity = 'critical';
      result.overall.summary = `${criticalIssues} critical email authentication issues found`;
    }

    // Generate recommendations
    if (!result.dmarc.exists) {
      result.overall.recommendations.push(
        'Add a DMARC record to enable email authentication reporting',
      );
    } else if (result.dmarc.policy === 'none') {
      result.overall.recommendations.push(
        'Upgrade DMARC policy from "none" to "quarantine" or "reject"',
      );
    }

    if (!result.spf.exists) {
      result.overall.recommendations.push(
        'Add an SPF record to authorize legitimate sending servers',
      );
    }

    if (result.dkim.foundSelectors.length === 0) {
      result.overall.recommendations.push(
        'Configure DKIM signing with a valid selector and public key',
      );
    }

    if (result.overall.recommendations.length === 0) {
      result.overall.recommendations.push(
        'Consider monitoring DMARC reports to ensure ongoing email security',
      );
    }
  }

  async validateMultipleDomains(
    domains: string[],
  ): Promise<DnsValidationResult[]> {
    const promises = domains.map((domain) => this.validateDomain(domain));
    return Promise.all(promises);
  }
}
