import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DmarcSearchService } from './dmarc-search.service';
import { DmarcReport } from '../entities/dmarc-report.entity';
import { DmarcRecord } from '../entities/dmarc-record.entity';
import { DkimResult } from '../entities/dkim-result.entity';
import { SpfResult } from '../entities/spf-result.entity';

describe('DmarcSearchService', () => {
  let service: DmarcSearchService;

  const mockDmarcReportRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockDmarcRecordRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockDkimResultRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockSpfResultRepository = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmarcSearchService,
        {
          provide: getRepositoryToken(DmarcReport),
          useValue: mockDmarcReportRepository,
        },
        {
          provide: getRepositoryToken(DmarcRecord),
          useValue: mockDmarcRecordRepository,
        },
        {
          provide: getRepositoryToken(DkimResult),
          useValue: mockDkimResultRepository,
        },
        {
          provide: getRepositoryToken(SpfResult),
          useValue: mockSpfResultRepository,
        },
      ],
    }).compile();

    service = module.get<DmarcSearchService>(DmarcSearchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDomains', () => {
    it('should combine and deduplicate domains from reports and records', async () => {
      const reportQB = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([
            { domain: 'example.com' },
            { domain: 'test.com' },
          ]),
      };
      const recordQB = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([
            { domain: 'example.com' },
            { domain: 'another.com' },
          ]),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValueOnce(
        reportQB as any,
      );
      mockDmarcRecordRepository.createQueryBuilder.mockReturnValueOnce(
        recordQB as any,
      );

      const result = await service.getDomains();
      expect(result).toEqual(['another.com', 'example.com', 'test.com']); // sorted
    });
  });

  describe('getReportDomains', () => {
    it('should return ordered list from reports only', async () => {
      const reportQB = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ domain: 'a.com' }, { domain: 'b.com' }]),
      };
      mockDmarcReportRepository.createQueryBuilder.mockReturnValueOnce(
        reportQB as any,
      );

      const result = await service.getReportDomains();
      expect(result).toEqual(['a.com', 'b.com']);
      expect(reportQB.orderBy).toHaveBeenCalledWith('domain', 'ASC');
    });
  });

  describe('searchRecords', () => {
    it('should return paginated search results', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([[{ id: '1', sourceIp: '1.2.3.4' }], 1]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.searchRecords({ page: 1, pageSize: 10 });

      expect(result).toEqual({
        data: [{ id: '1', sourceIp: '1.2.3.4' }],
        total: 1,
        page: 1,
        pageSize: 10,
      });
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('should filter by domain', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(qb as any);

      await service.searchRecords({
        domain: 'example.com',
        page: 1,
        pageSize: 10,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('rep.domain = ANY(:domains)', {
        domains: ['example.com'],
      });
    });

    it('should filter by disposition', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(qb as any);

      await service.searchRecords({
        disposition: 'reject',
        page: 1,
        pageSize: 10,
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'rec.disposition IN (:...disps)',
        { disps: ['reject'] },
      );
    });

    it('should filter by date range', async () => {
      const from = new Date('2024-01-01');
      const to = new Date('2024-12-31');

      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(qb as any);

      await service.searchRecords({ from, to, page: 1, pageSize: 10 });

      expect(qb.andWhere).toHaveBeenCalledWith('rep.beginDate >= :from', {
        from,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('rep.beginDate <= :to', { to });
    });

    it('should filter by DKIM status', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(qb as any);

      await service.searchRecords({ dkim: 'pass', page: 1, pageSize: 10 });

      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('should handle multiple filter values', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(qb as any);

      await service.searchRecords({
        disposition: ['none', 'quarantine'],
        page: 1,
        pageSize: 10,
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'rec.disposition IN (:...disps)',
        { disps: ['none', 'quarantine'] },
      );
    });
  });

  describe('getDistinctValues', () => {
    it('should return distinct domains', async () => {
      const reportQB = {
        select: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ v: 'example.com' }, { v: 'test.com' }]),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValue(
        reportQB as any,
      );

      const result = await service.getDistinctValues('domain');

      expect(result).toEqual(['example.com', 'test.com']);
      expect(reportQB.select).toHaveBeenCalledWith('DISTINCT rep.domain', 'v');
    });

    it('should return distinct org names', async () => {
      const reportQB = {
        select: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ v: 'Google' }, { v: 'Microsoft' }]),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValue(
        reportQB as any,
      );

      const result = await service.getDistinctValues('orgName');

      expect(result).toEqual(['Google', 'Microsoft']);
      expect(reportQB.select).toHaveBeenCalledWith('DISTINCT rep.orgName', 'v');
    });

    it('should return distinct source IPs', async () => {
      const recordQB = {
        select: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ v: '1.2.3.4' }, { v: '5.6.7.8' }]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        recordQB as any,
      );

      const result = await service.getDistinctValues('sourceIp');

      expect(result).toEqual(['1.2.3.4', '5.6.7.8']);
      expect(recordQB.select).toHaveBeenCalledWith(
        'DISTINCT rec.sourceIp',
        'v',
      );
    });

    it('should filter by date range', async () => {
      const from = new Date('2024-01-01');
      const to = new Date('2024-12-31');

      const reportQB = {
        select: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValue(
        reportQB as any,
      );

      await service.getDistinctValues('domain', from, to);

      expect(reportQB.andWhere).toHaveBeenCalledWith('rep.beginDate >= :from', {
        from,
      });
      expect(reportQB.andWhere).toHaveBeenCalledWith('rep.beginDate <= :to', {
        to,
      });
    });
  });
});
