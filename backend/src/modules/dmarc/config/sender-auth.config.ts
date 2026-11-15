import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SenderAuthMode = 'off' | 'flag' | 'enforce';

export interface SenderAuthConfig {
  mode: SenderAuthMode;
  /** ARC-Seal `d=` domains whose recorded results are believed. */
  trustedArcSealers: ReadonlySet<string>;
  /** Domains that relay reports to us and must never vouch for a reporter. */
  relayDomains: ReadonlySet<string>;
}

const MODES: readonly SenderAuthMode[] = ['off', 'flag', 'enforce'];
const DEFAULT_MODE: SenderAuthMode = 'flag';

const logger = new Logger('SenderAuthConfig');

function readDomainList(config: ConfigService, key: string): Set<string> {
  return new Set(
    (config.get<string>(key) ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0),
  );
}

function readMode(config: ConfigService): SenderAuthMode {
  const raw = (config.get<string>('REPORT_SENDER_AUTH') ?? '')
    .trim()
    .toLowerCase();
  if (!raw) {
    return DEFAULT_MODE;
  }
  if ((MODES as readonly string[]).includes(raw)) {
    return raw as SenderAuthMode;
  }
  logger.warn(
    `Ignoring invalid REPORT_SENDER_AUTH=${raw}; using ${DEFAULT_MODE}`,
  );
  return DEFAULT_MODE;
}

export function getSenderAuthConfig(config: ConfigService): SenderAuthConfig {
  return Object.freeze({
    mode: readMode(config),
    trustedArcSealers: readDomainList(config, 'REPORT_TRUSTED_ARC_SEALERS'),
    relayDomains: readDomainList(config, 'REPORT_RELAY_DOMAINS'),
  });
}
