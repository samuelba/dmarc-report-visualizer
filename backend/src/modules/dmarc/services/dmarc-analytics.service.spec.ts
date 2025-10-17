import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DmarcAnalyticsService } from './dmarc-analytics.service';
import { DmarcReport } from '../entities/dmarc-report.entity';
import { DmarcRecord } from '../entities/dmarc-record.entity';

describe('DmarcAnalyticsService', () => {
  let service: DmarcAnalyticsService;

  const mockDmarcReportRepository = {
    find: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockDmarcRecordRepository = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmarcAnalyticsService,
        {
          provide: getRepositoryToken(DmarcReport),
          useValue: mockDmarcReportRepository,
        },
        {
          provide: getRepositoryToken(DmarcRecord),
          useValue: mockDmarcRecordRepository,
        },
      ],
    }).compile();

    service = module.get<DmarcAnalyticsService>(DmarcAnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('summaryStats', () => {
    it('should return summary statistics without filters', async () => {
      mockDmarcReportRepository.find.mockResolvedValue([]);
      mockDmarcReportRepository.count.mockResolvedValue(100);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
      };

      mockDmarcReportRepository.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder)
        .mockReturnValueOnce(mockQueryBuilder);

      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ count: '10' })
        .mockResolvedValueOnce({ count: '50' });

      const result = await service.summaryStats({});

      expect(result).toEqual({
        totalReports: 100,
        uniqueDomains: 10,
        uniqueReportIds: 50,
      });
      expect(mockDmarcReportRepository.count).toHaveBeenCalled();
      expect(
        mockDmarcReportRepository.createQueryBuilder,
      ).toHaveBeenCalledTimes(2);
    });

    it('should filter summary statistics by domain', async () => {
      mockDmarcReportRepository.find.mockResolvedValue([]);
      mockDmarcReportRepository.count.mockResolvedValue(25);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ count: '5' })
        .mockResolvedValueOnce({ count: '20' });

      const result = await service.summaryStats({ domain: 'example.com' });

      expect(result).toEqual({
        totalReports: 25,
        uniqueDomains: 5,
        uniqueReportIds: 20,
      });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'r.domain ILIKE :domain',
        { domain: '%example.com%' },
      );
    });

    it('should filter summary statistics by date range', async () => {
      const from = new Date('2024-01-01');
      const to = new Date('2024-12-31');

      mockDmarcReportRepository.find.mockResolvedValue([]);
      mockDmarcReportRepository.count.mockResolvedValue(50);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ count: '8' })
        .mockResolvedValueOnce({ count: '40' });

      const result = await service.summaryStats({ from, to });

      expect(result.totalReports).toBe(50);
      expect(mockDmarcReportRepository.find).toHaveBeenCalled();
    });
  });

  describe('timeSeries', () => {
    it('should return time series data by day', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { bucket: '2024-01-01', count: '10' },
          { bucket: '2024-01-02', count: '15' },
        ]),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.timeSeries({
        interval: 'day',
      });

      expect(result).toEqual([
        { date: '2024-01-01', count: 10 },
        { date: '2024-01-02', count: 15 },
      ]);
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        "DATE_TRUNC('day', rep.beginDate)",
        'bucket',
      );
    });

    it('should return time series data by week', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ bucket: '2024-01-01', count: '50' }]),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.timeSeries({
        interval: 'week',
      });

      expect(result).toEqual([{ date: '2024-01-01', count: 50 }]);
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        "DATE_TRUNC('week', rep.beginDate)",
        'bucket',
      );
    });

    it('should filter time series by domain', async () => {
      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.timeSeries({
        domain: 'example.com',
        interval: 'day',
      });

      expect(mockQueryBuilder.innerJoin).toHaveBeenCalledWith(
        'rep.records',
        'rec',
        'rec.headerFrom ILIKE :domain',
        { domain: '%example.com%' },
      );
    });

    it('should filter time series by date range', async () => {
      const from = new Date('2024-01-01');
      const to = new Date('2024-12-31');

      const mockQueryBuilder = {
        innerJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.timeSeries({
        from,
        to,
        interval: 'day',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rep.beginDate >= :from',
        {
          from,
        },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rep.beginDate <= :to',
        { to },
      );
    });
  });

  describe('topSources', () => {
    it('should return top sources', async () => {
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { source: 'example.com', count: '100' },
          { source: 'test.com', count: '50' },
        ]),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.topSources({ limit: 10 });

      expect(result).toEqual([
        { source: 'example.com', count: 100 },
        { source: 'test.com', count: 50 },
      ]);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('count', 'DESC');
    });

    it('should filter top sources by domain', async () => {
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockDmarcReportRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.topSources({ domain: 'example.com', limit: 5 });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'r.domain ILIKE :domain',
        {
          domain: '%example.com%',
        },
      );
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(5);
    });
  });

  describe('authSummary', () => {
    it('should return authentication summary', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          total: '1000',
          dkimPass: '800',
          spfPass: '750',
          dmarcPass: '850',
          enforcement: '100',
        }),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.authSummary({});

      expect(result).toEqual({
        total: 1000,
        dkimPass: 800,
        spfPass: 750,
        dmarcPass: 850,
        enforcement: 100,
      });
      expect(mockDmarcRecordRepository.createQueryBuilder).toHaveBeenCalledWith(
        'rec',
      );
      expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
        'rec.report',
        'rep',
      );
    });

    it('should filter authentication summary by domain', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          total: '500',
          dkimPass: '400',
          spfPass: '350',
          dmarcPass: '425',
          enforcement: '50',
        }),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.authSummary({ domain: 'example.com' });

      expect(result.total).toBe(500);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rec.headerFrom ILIKE :domain',
        {
          domain: '%example.com%',
        },
      );
    });

    it('should handle null values in authentication summary', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.authSummary({});

      expect(result).toEqual({
        total: 0,
        dkimPass: 0,
        spfPass: 0,
        dmarcPass: 0,
        enforcement: 0,
      });
    });
  });

  describe('authBreakdown', () => {
    it('should return authentication breakdown', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          dkimPass: '800',
          dkimFail: '150',
          dkimMissing: '50',
          spfPass: '750',
          spfFail: '250',
        }),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.authBreakdown({});

      expect(result).toEqual({
        dkim: {
          pass: 800,
          fail: 150,
          missing: 50,
        },
        spf: {
          pass: 750,
          fail: 250,
        },
      });
      expect(mockDmarcRecordRepository.createQueryBuilder).toHaveBeenCalledWith(
        'rec',
      );
    });

    it('should filter authentication breakdown by domain', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          dkimPass: '400',
          dkimFail: '80',
          dkimMissing: '20',
          spfPass: '350',
          spfFail: '150',
        }),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.authBreakdown({ domain: 'example.com' });

      expect(result.dkim.pass).toBe(400);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rec.headerFrom ILIKE :domain',
        {
          domain: '%example.com%',
        },
      );
    });

    it('should handle null values in authentication breakdown', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.authBreakdown({});

      expect(result).toEqual({
        dkim: {
          pass: 0,
          fail: 0,
          missing: 0,
        },
        spf: {
          pass: 0,
          fail: 0,
        },
      });
    });
  });

  describe('authPassRateTimeseries', () => {
    it('should return authentication pass rate time series', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            bucket: '2024-01-01',
            total: '1000',
            dkimPass: '800',
            spfPass: '750',
          },
          {
            bucket: '2024-01-02',
            total: '1200',
            dkimPass: '960',
            spfPass: '900',
          },
        ]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.authPassRateTimeseries({
        interval: 'day',
      });

      expect(result).toEqual([
        {
          date: '2024-01-01',
          totalCount: 1000,
          dkimPassCount: 800,
          spfPassCount: 750,
          dkimPassRate: 80,
          spfPassRate: 75,
        },
        {
          date: '2024-01-02',
          totalCount: 1200,
          dkimPassCount: 960,
          spfPassCount: 900,
          dkimPassRate: 80,
          spfPassRate: 75,
        },
      ]);
    });

    it('should handle zero total count in pass rate calculation', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([
            { bucket: '2024-01-01', total: '0', dkimPass: '0', spfPass: '0' },
          ]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.authPassRateTimeseries({
        interval: 'day',
      });

      expect(result[0]).toEqual({
        date: '2024-01-01',
        totalCount: 0,
        dkimPassCount: 0,
        spfPassCount: 0,
        dkimPassRate: 0,
        spfPassRate: 0,
      });
    });
  });

  describe('dispositionTimeseries', () => {
    it('should return disposition time series', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            bucket: '2024-01-01',
            none: '800',
            quarantine: '150',
            reject: '50',
            total: '1000',
          },
          {
            bucket: '2024-01-02',
            none: '900',
            quarantine: '200',
            reject: '100',
            total: '1200',
          },
        ]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.dispositionTimeseries({ interval: 'day' });

      expect(result).toEqual([
        {
          date: '2024-01-01',
          none: 800,
          quarantine: 150,
          reject: 50,
          total: 1000,
        },
        {
          date: '2024-01-02',
          none: 900,
          quarantine: 200,
          reject: 100,
          total: 1200,
        },
      ]);
    });

    it('should filter disposition timeseries by domain', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.dispositionTimeseries({
        domain: 'example.com',
        interval: 'week',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rec.headerFrom ILIKE :domain',
        {
          domain: '%example.com%',
        },
      );
    });
  });

  describe('authMatrix', () => {
    it('should return authentication matrix', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          pp: '700',
          pf: '100',
          fp: '50',
          ff: '150',
        }),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.authMatrix({});

      expect(result).toEqual({
        dkimPass_spfPass: 700,
        dkimPass_spfFail: 100,
        dkimFail_spfPass: 50,
        dkimFail_spfFail: 150,
      });
    });

    it('should filter auth matrix by date range', async () => {
      const from = new Date('2024-01-01');
      const to = new Date('2024-12-31');

      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          pp: '500',
          pf: '50',
          fp: '25',
          ff: '75',
        }),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.authMatrix({ from, to });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rep.beginDate >= :from',
        { from },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rep.beginDate <= :to',
        { to },
      );
    });
  });

  describe('topIps', () => {
    it('should return top IPs', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            ip: '1.2.3.4',
            total: '1000',
            pass: '800',
            fail: '200',
            lastSeen: '2024-01-15',
          },
          {
            ip: '5.6.7.8',
            total: '500',
            pass: '400',
            fail: '100',
            lastSeen: '2024-01-14',
          },
        ]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.topIps({ limit: 10 });

      expect(result).toEqual([
        {
          ip: '1.2.3.4',
          total: 1000,
          pass: 800,
          fail: 200,
          lastSeen: '2024-01-15',
        },
        {
          ip: '5.6.7.8',
          total: 500,
          pass: 400,
          fail: 100,
          lastSeen: '2024-01-14',
        },
      ]);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
    });

    it('should filter top IPs by domain', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.topIps({ domain: 'example.com', limit: 5 });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rec.headerFrom ILIKE :domain',
        {
          domain: '%example.com%',
        },
      );
    });
  });

  describe('newIps', () => {
    it('should return new IPs', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { ip: '9.10.11.12', firstSeen: '2024-01-15', count: '10' },
          { ip: '13.14.15.16', firstSeen: '2024-01-14', count: '5' },
        ]),
      };

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.newIps({ limit: 10 });

      expect(result).toEqual([
        { ip: '9.10.11.12', firstSeen: '2024-01-15', count: 10 },
        { ip: '13.14.15.16', firstSeen: '2024-01-14', count: 5 },
      ]);
    });
  });
});
