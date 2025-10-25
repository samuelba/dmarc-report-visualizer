import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DmarcGeoAnalyticsService } from './dmarc-geo-analytics.service';
import { DmarcReport } from '../entities/dmarc-report.entity';
import { DmarcRecord } from '../entities/dmarc-record.entity';

describe('DmarcGeoAnalyticsService', () => {
  let service: DmarcGeoAnalyticsService;

  const mockDmarcRecordRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockDmarcReportRepository = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmarcGeoAnalyticsService,
        {
          provide: getRepositoryToken(DmarcRecord),
          useValue: mockDmarcRecordRepository,
        },
        {
          provide: getRepositoryToken(DmarcReport),
          useValue: mockDmarcReportRepository,
        },
      ],
    }).compile();

    service = module.get<DmarcGeoAnalyticsService>(DmarcGeoAnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTopCountries', () => {
    it('should return mapped results and honor limit', async () => {
      const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            country: 'US',
            count: '100',
            dmarcpasscount: '80',
            dkimpasscount: '70',
            spfpasscount: '75',
          },
          {
            country: 'DE',
            count: '50',
            dmarcpasscount: '40',
            dkimpasscount: '35',
            spfpasscount: '30',
          },
        ]),
      };
      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getTopCountries({ limit: 2 });
      expect(result[0]).toEqual({
        country: 'US',
        count: 100,
        dmarcPassCount: 80,
        dkimPassCount: 70,
        spfPassCount: 75,
      });
      expect(qb.limit).toHaveBeenCalledWith(2);
    });

    it('should apply filters (domain, from, to)', async () => {
      const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(qb as any);

      const from = new Date('2024-01-01');
      const to = new Date('2024-12-31');
      await service.getTopCountries({
        domain: 'example.com',
        from,
        to,
        limit: 5,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'record.headerFrom ILIKE :domain',
        { domain: '%example.com%' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('report.beginDate >= :from', {
        from,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('report.endDate <= :to', { to });
    });
  });

  describe('getTopCountriesPaginated', () => {
    it('should return paginated data and total', async () => {
      const baseQB: any = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        clone: jest.fn(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
        getRawMany: jest.fn(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };
      const totalQB: any = {
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '3' }),
      };
      baseQB.clone.mockReturnValue(totalQB);
      baseQB.getRawMany.mockResolvedValue([
        {
          country: 'US',
          count: '100',
          dmarcpasscount: '80',
          dkimpasscount: '70',
          spfpasscount: '75',
        },
        {
          country: 'DE',
          count: '50',
          dmarcpasscount: '40',
          dkimpasscount: '35',
          spfpasscount: '30',
        },
      ]);
      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(baseQB);

      const result = await service.getTopCountriesPaginated({
        page: 1,
        pageSize: 2,
      });
      expect(result.total).toBe(3);
      expect(result.data[0].country).toBe('US');
      expect(baseQB.offset).toHaveBeenCalledWith(0);
      expect(baseQB.limit).toHaveBeenCalledWith(2);
    });
  });

  describe('getGeoHeatmapData', () => {
    it('should return mapped heatmap points aggregated by country', async () => {
      const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            country: 'US',
            latitude: '37.77',
            longitude: '-122.42',
            count: '100',
            passcount: '80',
            failcount: '20',
          },
        ]),
      };
      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.getGeoHeatmapData({});
      expect(result[0]).toEqual({
        country: 'US',
        latitude: 37.77,
        longitude: -122.42,
        count: 100,
        passCount: 80,
        failCount: 20,
      });
    });
  });

  describe('getTopIpsEnhanced', () => {
    it('should return paginated enhanced IP data', async () => {
      const baseQB: any = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '2' }),
        getRawMany: jest.fn().mockResolvedValue([
          {
            sourceip: '1.2.3.4',
            country: 'US',
            countryname: 'United States',
            city: 'NY',
            latitude: '40.7',
            longitude: '-74.0',
            count: '100',
            passcount: '80',
            failcount: '20',
            dkimpasscount: '60',
            spfpasscount: '70',
          },
          {
            sourceip: '5.6.7.8',
            count: '50',
            passcount: '40',
            failcount: '10',
            dkimpasscount: '30',
            spfpasscount: '35',
          },
        ]),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };
      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(baseQB);

      const result = await service.getTopIpsEnhanced({ page: 1, pageSize: 10 });
      expect(result.total).toBe(2);
      expect(result.data[0].sourceIp).toBe('1.2.3.4');
      expect(result.data[0].latitude).toBe(40.7);
      expect(result.data[1].country).toBeUndefined();
    });
  });

  describe('getTopHeaderFromDomainsPaginated', () => {
    it('should return paginated headerFrom data', async () => {
      const baseQB: any = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        clone: jest.fn(),
        getRawOne: jest.fn(),
        getRawMany: jest.fn(),
      };

      const totalQB: any = {
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '4' }),
      };
      baseQB.clone.mockReturnValue(totalQB);
      baseQB.getRawMany.mockResolvedValue([
        {
          headerfrom: 'a.example.com',
          count: '10',
          dmarcpasscount: '8',
          dkimpasscount: '7',
          spfpasscount: '7',
        },
        {
          headerfrom: 'b.example.com',
          count: '5',
          dmarcpasscount: '3',
          dkimpasscount: '2',
          spfpasscount: '3',
        },
      ]);

      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(baseQB);

      const result = await service.getTopHeaderFromDomainsPaginated({
        page: 1,
        pageSize: 2,
      });
      expect(result.total).toBe(4);
      expect(result.data[0].headerFrom).toBe('a.example.com');
      expect(baseQB.offset).toHaveBeenCalledWith(0);
      expect(baseQB.limit).toHaveBeenCalledWith(2);
    });
  });
});
