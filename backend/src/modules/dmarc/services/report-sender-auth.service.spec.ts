import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Domain } from '../entities/domain.entity';
import { MessageAuth } from '../utils/sender-authentication';
import { TrustedReporterService } from './trusted-reporter.service';
import {
  ReportSenderAuthService,
  SenderAuthUnavailableError,
  UnverifiedSenderError,
} from './report-sender-auth.service';

const notFound = () =>
  Promise.reject(Object.assign(new Error('nx'), { code: 'ENOTFOUND' }));

const build = (env: Record<string, string> = {}) => {
  const domains = {
    find: jest
      .fn()
      .mockResolvedValue([
        { domain: 'registration.anymal.com' },
        { domain: 'anybotics.com' },
      ]),
  } as unknown as Repository<Domain>;
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  const trustedReporters = {
    trustedPairs: jest
      .fn()
      .mockResolvedValue(
        (claimed: string, auth: string) =>
          claimed === 'yahooinc.com' && auth === 'dmarc.yahoo.com',
      ),
  } as unknown as TrustedReporterService;
  return {
    service: new ReportSenderAuthService(
      config,
      domains,
      trustedReporters,
      notFound,
    ),
    domains,
  };
};

const auth = (
  identities: MessageAuth['identities'],
  tempError = false,
): MessageAuth => ({
  identities,
  dkim: [],
  arc: { result: identities.length ? 'pass' : 'none', instances: [] },
  tempError,
});

const BASE = { source: 'gmail', sourceMessageId: '<m1@google.com>' } as const;

describe('ReportSenderAuthService', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('verifyMessage', () => {
    it('skips verification entirely when sender auth is off', async () => {
      const { service } = build({ REPORT_SENDER_AUTH: 'off' });

      await expect(
        service.verifyMessage(Buffer.from('From: a@b.example\r\n\r\nx')),
      ).resolves.toBeNull();
    });

    it('returns an empty result for an unsigned message', async () => {
      const { service } = build();

      const result = await service.verifyMessage(
        Buffer.from('From: a@b.example\r\nSubject: x\r\n\r\nbody\r\n'),
      );

      expect(result).toMatchObject({ identities: [], tempError: false });
    });
  });

  describe('assess', () => {
    it('returns an aligned provenance for a matching identity', async () => {
      const { service } = build();

      const provenance = await service.assess(
        auth([{ domain: 'google.com', source: 'dkim', method: 'arc' }]),
        'noreply-dmarc-support@google.com',
        BASE,
      );

      expect(provenance).toMatchObject({
        ...BASE,
        authStatus: 'aligned',
        authMethod: 'arc',
        authDomain: 'google.com',
        claimedDomain: 'google.com',
        authDetails: expect.objectContaining({
          matchedIdentity: expect.objectContaining({ domain: 'google.com' }),
        }),
      });
    });

    it('never accepts managed or configured relay domains as the reporter', async () => {
      const { service } = build({ REPORT_RELAY_DOMAINS: 'relay.example' });

      const provenance = await service.assess(
        auth([
          { domain: 'anybotics.com', source: 'dkim', method: 'dkim' },
          { domain: 'mail.anymal.com', source: 'dkim', method: 'arc' },
          { domain: 'relay.example', source: 'dkim', method: 'arc' },
        ]),
        'dmarc@anybotics.com',
        BASE,
      );

      expect(provenance.authStatus).toBe('unverified');
    });

    it('aligns an admin-trusted pair', async () => {
      const { service } = build();

      await expect(
        service.assess(
          auth([{ domain: 'dmarc.yahoo.com', source: 'dmarc', method: 'arc' }]),
          'dmarchelp@yahooinc.com',
          BASE,
        ),
      ).resolves.toMatchObject({
        authStatus: 'aligned',
        authDomain: 'dmarc.yahoo.com',
        claimedDomain: 'yahooinc.com',
      });
    });

    it('is unverified without evidence when sender auth is off', async () => {
      const { service } = build({ REPORT_SENDER_AUTH: 'off' });

      await expect(
        service.assess(null, 'noreply@google.com', BASE),
      ).resolves.toEqual({ ...BASE, authStatus: 'unverified' });
    });

    it('stores unverified reports in flag mode', async () => {
      const { service } = build();

      await expect(
        service.assess(auth([]), 'noreply@google.com', BASE),
      ).resolves.toMatchObject({ authStatus: 'unverified' });
    });

    describe('in enforce mode', () => {
      it('rejects unverified reports permanently', async () => {
        const { service } = build({ REPORT_SENDER_AUTH: 'enforce' });

        await expect(
          service.assess(auth([]), 'noreply@google.com', BASE),
        ).rejects.toBeInstanceOf(UnverifiedSenderError);
      });

      it('asks for a retry when DNS failed transiently', async () => {
        const { service } = build({ REPORT_SENDER_AUTH: 'enforce' });

        await expect(
          service.assess(auth([], true), 'noreply@google.com', BASE),
        ).rejects.toBeInstanceOf(SenderAuthUnavailableError);
      });

      it('accepts unaligned but authenticated reports', async () => {
        const { service } = build({ REPORT_SENDER_AUTH: 'enforce' });

        await expect(
          service.assess(
            auth([{ domain: 'dmarc.aol.com', source: 'dmarc', method: 'arc' }]),
            'dmarchelp@yahooinc.com',
            BASE,
          ),
        ).resolves.toMatchObject({
          authStatus: 'unaligned',
          authDomain: 'dmarc.aol.com',
          claimedDomain: 'yahooinc.com',
        });
      });
    });
  });

  describe('onModuleInit', () => {
    it('warns when no ARC sealer is trusted, since relayed reports cannot verify', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const { service } = build();

      service.onModuleInit();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('REPORT_TRUSTED_ARC_SEALERS'),
      );
    });

    it('warns when enforce mode meets a downloader in legacy file mode', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const { service } = build({
        REPORT_SENDER_AUTH: 'enforce',
        REPORT_TRUSTED_ARC_SEALERS: 'google.com',
        ENABLE_GMAIL_DOWNLOADER: 'true',
        GMAIL_PROCESS_INLINE: 'false',
      });

      service.onModuleInit();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('GMAIL_PROCESS_INLINE'),
      );
    });
  });
});
