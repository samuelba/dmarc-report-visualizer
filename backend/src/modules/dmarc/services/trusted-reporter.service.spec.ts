import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { DmarcReport } from '../entities/dmarc-report.entity';
import { TrustedReporterDomain } from '../entities/trusted-reporter-domain.entity';
import { TrustedReporterService } from './trusted-reporter.service';

describe('TrustedReporterService', () => {
  const ADMIN = { id: 'user-1', email: 'admin@example.com' };

  let pairs: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let reports: { update: jest.Mock; query: jest.Mock };
  let service: TrustedReporterService;

  beforeEach(() => {
    reports = {
      update: jest.fn().mockResolvedValue({ affected: 100 }),
      query: jest.fn(),
    };
    pairs = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'pair-1', ...data })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: {
        transaction: jest.fn((work) =>
          work({
            getRepository: (entity: unknown) =>
              entity === DmarcReport ? reports : pairs,
          }),
        ),
      },
    };
    service = new TrustedReporterService(
      pairs as unknown as Repository<TrustedReporterDomain>,
      reports as unknown as Repository<DmarcReport>,
    );
  });

  describe('trust', () => {
    it('stores the pair and upgrades its unaligned reports in one transaction', async () => {
      const result = await service.trust(
        {
          claimedDomain: ' YahooInc.com ',
          authDomain: 'dmarc.yahoo.com.',
          note: 'Yahoo signs as yahoo.com',
        },
        ADMIN,
      );

      expect(pairs.manager.transaction).toHaveBeenCalledTimes(1);
      expect(pairs.save).toHaveBeenCalledWith({
        claimedDomain: 'yahooinc.com',
        authDomain: 'dmarc.yahoo.com',
        note: 'Yahoo signs as yahoo.com',
        createdBy: 'user-1',
        createdByEmail: 'admin@example.com',
      });
      expect(reports.update).toHaveBeenCalledWith(
        {
          authStatus: 'unaligned',
          claimedDomain: 'yahooinc.com',
          authDomain: 'dmarc.yahoo.com',
        },
        { authStatus: 'aligned' },
      );
      expect(result).toEqual({
        trusted: expect.objectContaining({ id: 'pair-1' }),
        upgradedReports: 100,
      });
    });

    it.each([
      [
        'a claimed domain that is not an organizational domain',
        'mail.yahooinc.com',
        'dmarc.yahoo.com',
      ],
      ['an invalid sending domain', 'yahooinc.com', 'not a domain'],
      ['a pair that is already aligned', 'yahoo.com', 'dmarc.yahoo.com'],
    ])('rejects %s', async (_label, claimedDomain, authDomain) => {
      await expect(
        service.trust({ claimedDomain, authDomain }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(pairs.save).not.toHaveBeenCalled();
    });

    it('rejects a pair that is already trusted', async () => {
      pairs.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.trust(
          { claimedDomain: 'yahooinc.com', authDomain: 'dmarc.yahoo.com' },
          ADMIN,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(reports.update).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('deletes the pair and downgrades only the reports it aligned', async () => {
      pairs.findOne.mockResolvedValue({
        id: 'pair-1',
        claimedDomain: 'yahooinc.com',
        authDomain: 'dmarc.yahoo.com',
      });
      reports.update.mockResolvedValue({ affected: 7 });

      await expect(service.revoke('pair-1')).resolves.toEqual({
        downgradedReports: 7,
      });
      expect(pairs.delete).toHaveBeenCalledWith('pair-1');
      expect(reports.update).toHaveBeenCalledWith(
        {
          authStatus: 'aligned',
          claimedDomain: 'yahooinc.com',
          authDomain: 'dmarc.yahoo.com',
        },
        { authStatus: 'unaligned' },
      );
    });

    it('fails for an unknown pair', async () => {
      await expect(service.revoke('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('lookups', () => {
    it('answers whether an exact pair is trusted', async () => {
      pairs.find.mockResolvedValue([
        { claimedDomain: 'yahooinc.com', authDomain: 'dmarc.yahoo.com' },
      ]);

      const isTrusted = await service.trustedPairs();

      expect(isTrusted('yahooinc.com', 'dmarc.yahoo.com')).toBe(true);
      expect(isTrusted('yahooinc.com', 'yahoo.com')).toBe(false);
    });

    it('groups unaligned reports by claimed and sending domain', async () => {
      const rows = [
        {
          claimedDomain: 'yahooinc.com',
          authDomain: 'dmarc.yahoo.com',
          orgNames: ['Yahoo'],
          reportCount: 100,
          firstSeen: new Date('2026-11-01'),
          lastSeen: new Date('2026-11-15'),
        },
      ];
      reports.query.mockResolvedValue(rows);

      await expect(service.listUnaligned()).resolves.toEqual(rows);
      const sql: string = reports.query.mock.calls[0][0];
      expect(sql).toContain(`"authStatus" = 'unaligned'`);
      expect(sql).toContain('GROUP BY "claimedDomain", "authDomain"');
    });

    it('lists trusted pairs newest first', async () => {
      pairs.find.mockResolvedValue([]);

      await service.listTrusted();

      expect(pairs.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
    });
  });
});
