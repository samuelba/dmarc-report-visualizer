import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DmarcReportService } from './dmarc-report.service';
import { DmarcReport } from './entities/dmarc-report.entity';
import { DmarcRecord } from './entities/dmarc-record.entity';
import { DkimResult } from './entities/dkim-result.entity';
import { SpfResult } from './entities/spf-result.entity';
import { PolicyOverrideReason } from './entities/policy-override-reason.entity';
import { DmarcParserService } from './services/dmarc-parser.service';
import { DmarcAnalyticsService } from './services/dmarc-analytics.service';
import { DmarcGeoAnalyticsService } from './services/dmarc-geo-analytics.service';
import { DmarcSearchService } from './services/dmarc-search.service';

describe('DmarcReportService', () => {
  let service: DmarcReportService;

  // Mock repositories
  const mockDmarcReportRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
    query: jest.fn(),
  };

  const mockDmarcRecordRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockGenericRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  // Mock services
  const mockDmarcParserService = {
    parseXmlReport: jest.fn(),
    unzipReport: jest.fn(),
    queueIpLookupsForRecords: jest.fn(),
  };

  const mockDmarcAnalyticsService = {
    summaryStats: jest.fn(),
    timeSeries: jest.fn(),
    topSources: jest.fn(),
    authSummary: jest.fn(),
    authBreakdown: jest.fn(),
    authPassRateTimeseries: jest.fn(),
    dispositionTimeseries: jest.fn(),
    authMatrix: jest.fn(),
    topIps: jest.fn(),
    newIps: jest.fn(),
  };

  const mockDmarcGeoAnalyticsService = {
    getTopCountries: jest.fn(),
    getTopCountriesPaginated: jest.fn(),
    getGeoHeatmapData: jest.fn(),
    getTopIpsEnhanced: jest.fn(),
    getTopHeaderFromDomainsPaginated: jest.fn(),
  };

  const mockDmarcSearchService = {
    searchRecords: jest.fn(),
    getDistinctValues: jest.fn(),
    getDomains: jest.fn(),
    getReportDomains: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmarcReportService,
        {
          provide: DmarcParserService,
          useValue: mockDmarcParserService,
        },
        {
          provide: DmarcAnalyticsService,
          useValue: mockDmarcAnalyticsService,
        },
        {
          provide: DmarcGeoAnalyticsService,
          useValue: mockDmarcGeoAnalyticsService,
        },
        {
          provide: DmarcSearchService,
          useValue: mockDmarcSearchService,
        },
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
          useValue: mockGenericRepository,
        },
        {
          provide: getRepositoryToken(SpfResult),
          useValue: mockGenericRepository,
        },
        {
          provide: getRepositoryToken(PolicyOverrideReason),
          useValue: mockGenericRepository,
        },
      ],
    }).compile();

    service = module.get<DmarcReportService>(DmarcReportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CRUD Operations', () => {
    it('should find all reports', async () => {
      const mockReports = [
        { id: '1', reportId: 'report1' } as DmarcReport,
        { id: '2', reportId: 'report2' } as DmarcReport,
      ];

      mockDmarcReportRepository.find.mockResolvedValue(mockReports);

      const result = await service.findAll();

      expect(result).toEqual(mockReports);
      expect(mockDmarcReportRepository.find).toHaveBeenCalledWith({
        relations: {
          records: {
            dkimResults: true,
            spfResults: true,
            policyOverrideReasons: true,
          },
        },
      });
    });

    it('should find one report by ID', async () => {
      const mockReport = { id: '123', reportId: 'report1' } as DmarcReport;
      mockDmarcReportRepository.findOne.mockResolvedValue(mockReport);

      const result = await service.findOne('123');

      expect(result).toEqual(mockReport);
      expect(mockDmarcReportRepository.findOne).toHaveBeenCalledWith({
        where: { id: '123' },
        relations: {
          records: {
            dkimResults: true,
            spfResults: true,
            policyOverrideReasons: true,
          },
        },
      });
    });

    it('should return null if report not found', async () => {
      mockDmarcReportRepository.findOne.mockResolvedValue(null);

      const result = await service.findOne('999');

      expect(result).toBeNull();
    });

    it('should find report by reportId', async () => {
      const mockReport = {
        id: '123',
        reportId: 'example.com:123456',
      } as DmarcReport;
      mockDmarcReportRepository.findOne.mockResolvedValue(mockReport);

      const result = await service.findByReportId('example.com:123456');

      expect(result).toEqual(mockReport);
      expect(mockDmarcReportRepository.findOne).toHaveBeenCalledWith({
        where: { reportId: 'example.com:123456' },
        relations: {
          records: {
            dkimResults: true,
            spfResults: true,
            policyOverrideReasons: true,
          },
        },
      });
    });

    it('should find report by composite key', async () => {
      const mockReport = {
        id: '123',
        reportId: 'example.com:123456',
        orgName: 'Google',
        email: 'noreply@google.com',
      } as DmarcReport;
      mockDmarcReportRepository.findOne.mockResolvedValue(mockReport);

      const result = await service.findByCompositeKey(
        'example.com:123456',
        'Google',
        'noreply@google.com',
      );

      expect(result).toEqual(mockReport);
      expect(mockDmarcReportRepository.findOne).toHaveBeenCalledWith({
        where: {
          reportId: 'example.com:123456',
          orgName: 'Google',
          email: 'noreply@google.com',
        },
        relations: {
          records: {
            dkimResults: true,
            spfResults: true,
            policyOverrideReasons: true,
          },
        },
      });
    });

    it('should handle undefined orgName and email in composite key', async () => {
      const mockReport = {
        id: '123',
        reportId: 'example.com:123456',
      } as DmarcReport;
      mockDmarcReportRepository.findOne.mockResolvedValue(mockReport);

      const result = await service.findByCompositeKey('example.com:123456');

      expect(result).toEqual(mockReport);
      expect(mockDmarcReportRepository.findOne).toHaveBeenCalledWith({
        where: {
          reportId: 'example.com:123456',
          orgName: undefined,
          email: undefined,
        },
        relations: {
          records: {
            dkimResults: true,
            spfResults: true,
            policyOverrideReasons: true,
          },
        },
      });
    });

    it('should preserve empty strings in composite key (not convert to undefined)', async () => {
      const mockReport = {
        id: '123',
        reportId: 'example.com:123456',
        orgName: '',
        email: '',
      } as DmarcReport;
      mockDmarcReportRepository.findOne.mockResolvedValue(mockReport);

      const result = await service.findByCompositeKey(
        'example.com:123456',
        '',
        '',
      );

      expect(result).toEqual(mockReport);
      // Empty strings should be preserved, not converted to undefined
      expect(mockDmarcReportRepository.findOne).toHaveBeenCalledWith({
        where: {
          reportId: 'example.com:123456',
          orgName: '',
          email: '',
        },
        relations: {
          records: {
            dkimResults: true,
            spfResults: true,
            policyOverrideReasons: true,
          },
        },
      });
    });

    it('should delete a report by ID', async () => {
      mockDmarcReportRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove('123');

      expect(mockDmarcReportRepository.delete).toHaveBeenCalledWith('123');
    });

    it('should delete old reports in batches', async () => {
      const olderThanDate = new Date('2023-01-01');

      // Mock query to return different results for each batch
      // The function stops when deletedInBatch < batchSize
      mockDmarcReportRepository.query
        .mockResolvedValueOnce([[], 500]) // First batch: 500 deleted (full batch)
        .mockResolvedValueOnce([[], 500]) // Second batch: 500 deleted (full batch)
        .mockResolvedValueOnce([[], 230]); // Third batch: 230 deleted (less than batch size, stops)

      const result = await service.deleteOldReports(olderThanDate);

      expect(result.deletedCount).toBe(1230);
      expect(mockDmarcReportRepository.query).toHaveBeenCalledTimes(3);
      expect(mockDmarcReportRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM dmarc_reports'),
        [olderThanDate, 500],
      );
    });

    it('should handle empty delete when no old reports exist', async () => {
      const olderThanDate = new Date('2023-01-01');

      // Mock query to return 0 deletions
      mockDmarcReportRepository.query.mockResolvedValueOnce([[], 0]);

      const result = await service.deleteOldReports(olderThanDate);

      expect(result.deletedCount).toBe(0);
    });

    it('should update a report', async () => {
      const mockReport = { id: '123', domain: 'example.com' } as DmarcReport;
      mockDmarcReportRepository.update.mockResolvedValue({ affected: 1 });
      mockDmarcReportRepository.findOne.mockResolvedValue(mockReport);

      const result = await service.update('123', { domain: 'newdomain.com' });

      expect(mockDmarcReportRepository.update).toHaveBeenCalledWith('123', {
        domain: 'newdomain.com',
      });
      expect(result).toEqual(mockReport);
    });

    it('should list reports with pagination', async () => {
      const mockReports = [
        { id: '1', reportId: 'report1', domain: 'example.com' } as DmarcReport,
        { id: '2', reportId: 'report2', domain: 'test.com' } as DmarcReport,
      ];

      mockDmarcReportRepository.findAndCount.mockResolvedValue([
        mockReports,
        2,
      ]);

      const result = await service.list({
        page: 1,
        pageSize: 10,
      });

      expect(result).toEqual({
        data: mockReports,
        total: 2,
        page: 1,
        pageSize: 10,
      });
      expect(mockDmarcReportRepository.findAndCount).toHaveBeenCalled();
    });

    it('should list reports with domain filter', async () => {
      const mockReports = [
        { id: '1', reportId: 'report1', domain: 'example.com' } as DmarcReport,
      ];

      mockDmarcReportRepository.findAndCount.mockResolvedValue([
        mockReports,
        1,
      ]);

      const result = await service.list({
        domain: 'example',
        page: 1,
        pageSize: 10,
      });

      expect(result.data).toEqual(mockReports);
      expect(result.total).toBe(1);
    });

    it('should list reports with date range filter', async () => {
      const from = new Date('2024-01-01');
      const to = new Date('2024-12-31');
      const mockReports = [
        {
          id: '1',
          reportId: 'report1',
          beginDate: new Date('2024-06-01'),
        } as DmarcReport,
      ];

      mockDmarcReportRepository.findAndCount.mockResolvedValue([
        mockReports,
        1,
      ]);

      const result = await service.list({
        from,
        to,
        page: 1,
        pageSize: 10,
      });

      expect(result.data).toEqual(mockReports);
    });

    it('should sort reports by specified field and order', async () => {
      const mockReports = [{ id: '1', reportId: 'report1' } as DmarcReport];

      mockDmarcReportRepository.findAndCount.mockResolvedValue([
        mockReports,
        1,
      ]);

      await service.list({
        sort: 'endDate',
        order: 'asc',
        page: 1,
        pageSize: 10,
      });

      expect(mockDmarcReportRepository.findAndCount).toHaveBeenCalled();
    });

    it('should create a new report without records', async () => {
      const reportData = {
        reportId: 'test-report-id',
        orgName: 'Test Org',
        email: 'test@example.com',
        domain: 'example.com',
      };

      const createdReport = { id: '123', ...reportData } as DmarcReport;

      mockDmarcReportRepository.create.mockReturnValue(createdReport);
      mockDmarcReportRepository.save.mockResolvedValue(createdReport);
      mockDmarcReportRepository.findOne.mockResolvedValue(createdReport);

      const result = await service.create(reportData);

      expect(mockDmarcReportRepository.create).toHaveBeenCalledWith(reportData);
      expect(mockDmarcReportRepository.save).toHaveBeenCalledWith(
        createdReport,
      );
      expect(result).toEqual(createdReport);
    });

    it('should create a new report with records', async () => {
      const reportData = {
        reportId: 'test-report-id',
        orgName: 'Test Org',
        domain: 'example.com',
        records: [
          {
            sourceIp: '1.2.3.4',
            count: 1,
            disposition: 'none',
          } as any,
        ],
      };

      const createdReport = {
        id: '123',
        reportId: 'test-report-id',
      } as DmarcReport;
      const createdRecord = {
        id: '456',
        reportId: '123',
        sourceIp: '1.2.3.4',
      } as DmarcRecord;

      mockDmarcReportRepository.create.mockReturnValue(createdReport);
      mockDmarcReportRepository.save.mockResolvedValue(createdReport);
      mockDmarcRecordRepository.create.mockReturnValue(createdRecord);
      mockDmarcRecordRepository.save.mockResolvedValue(createdRecord);
      mockDmarcReportRepository.findOne.mockResolvedValue({
        ...createdReport,
        records: [createdRecord],
      } as any);

      const result = await service.create(reportData);

      expect(mockDmarcReportRepository.create).toHaveBeenCalled();
      expect(mockDmarcRecordRepository.create).toHaveBeenCalledWith({
        sourceIp: '1.2.3.4',
        count: 1,
        disposition: 'none',
        reportId: '123',
      });
      expect(mockDmarcRecordRepository.save).toHaveBeenCalled();
      expect(result.records).toBeDefined();
    });

    it('should create a new report when reportId is missing (createOrUpdateByReportId)', async () => {
      const reportData = {
        orgName: 'Test Org',
        domain: 'example.com',
      };

      const createdReport = {
        id: '123',
        reportId: 'generated-id',
      } as DmarcReport;

      mockDmarcReportRepository.create.mockReturnValue(createdReport);
      mockDmarcReportRepository.save.mockResolvedValue(createdReport);
      mockDmarcReportRepository.findOne.mockResolvedValue(createdReport);

      const result = await service.createOrUpdateByReportId(reportData);

      expect(mockDmarcReportRepository.create).toHaveBeenCalled();
      expect(result).toEqual(createdReport);
    });

    it('should create a new report when reportId does not exist (createOrUpdateByReportId)', async () => {
      const reportData = {
        reportId: 'new-report-id',
        orgName: 'Test Org',
        email: 'test@example.com',
        domain: 'example.com',
      };

      const createdReport = { id: '123', ...reportData } as DmarcReport;

      // First findOne returns null (report doesn't exist with composite key)
      mockDmarcReportRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createdReport);
      mockDmarcReportRepository.create.mockReturnValue(createdReport);
      mockDmarcReportRepository.save.mockResolvedValue(createdReport);

      const result = await service.createOrUpdateByReportId(reportData);

      // Should use composite key lookup
      expect(mockDmarcReportRepository.findOne).toHaveBeenCalledWith({
        where: {
          reportId: 'new-report-id',
          orgName: 'Test Org',
          email: 'test@example.com',
        },
        relations: {
          records: {
            dkimResults: true,
            spfResults: true,
            policyOverrideReasons: true,
          },
        },
      });
      expect(mockDmarcReportRepository.create).toHaveBeenCalled();
      expect(result).toEqual(createdReport);
    });

    it('should update existing report when reportId exists (createOrUpdateByReportId)', async () => {
      const existingReport = {
        id: '123',
        reportId: 'existing-report-id',
        orgName: 'Old Org',
        email: 'old@example.com',
        records: [],
      } as any;

      const reportData = {
        reportId: 'existing-report-id',
        orgName: 'Old Org',
        email: 'old@example.com',
        domain: 'example.com',
        records: [{ sourceIp: '1.2.3.4', count: 1 } as any],
      };

      const updatedReport = {
        ...existingReport,
        domain: 'example.com',
        records: [{ sourceIp: '1.2.3.4', count: 1 }],
      };

      mockDmarcReportRepository.findOne
        .mockResolvedValueOnce(existingReport)
        .mockResolvedValueOnce(updatedReport);
      mockDmarcRecordRepository.delete.mockResolvedValue({ affected: 0 });
      mockDmarcReportRepository.update.mockResolvedValue({
        affected: 1,
      } as any);
      mockDmarcRecordRepository.create.mockReturnValue(reportData.records[0]);
      mockDmarcRecordRepository.save.mockResolvedValue(reportData.records[0]);

      const result = await service.createOrUpdateByReportId(reportData);

      expect(mockDmarcRecordRepository.delete).toHaveBeenCalledWith({
        reportId: '123',
      });
      expect(mockDmarcReportRepository.update).toHaveBeenCalledWith(
        '123',
        expect.any(Object),
      );
      expect(mockDmarcRecordRepository.create).toHaveBeenCalled();
      expect(result).toEqual(updatedReport);
    });

    it('should throw error if updated report not found (createOrUpdateByReportId)', async () => {
      const existingReport = {
        id: '123',
        reportId: 'existing-report-id',
        orgName: 'Test Org',
        email: 'test@example.com',
      } as any;

      const reportData = {
        reportId: 'existing-report-id',
        orgName: 'Test Org',
        email: 'test@example.com',
      };

      mockDmarcReportRepository.findOne
        .mockResolvedValueOnce(existingReport)
        .mockResolvedValueOnce(null);
      mockDmarcRecordRepository.delete.mockResolvedValue({ affected: 0 });
      mockDmarcReportRepository.update.mockResolvedValue({
        affected: 1,
      } as any);
      mockDmarcParserService.queueIpLookupsForRecords.mockResolvedValue(
        undefined,
      );

      await expect(
        service.createOrUpdateByReportId(reportData),
      ).rejects.toThrow('Failed to find updated DMARC report');
    });

    it('should get report original XML', async () => {
      const mockReport = {
        id: '123',
        originalXml: '<xml>test</xml>',
      } as any;

      mockDmarcReportRepository.findOne.mockResolvedValue(mockReport);

      const result = await service.getReportOriginalXml('123');

      expect(result).toBe('<xml>test</xml>');
      expect(mockDmarcReportRepository.findOne).toHaveBeenCalledWith({
        where: { id: '123' },
      });
    });

    it('should return null if report not found (getReportOriginalXml)', async () => {
      mockDmarcReportRepository.findOne.mockResolvedValue(null);

      const result = await service.getReportOriginalXml('999');

      expect(result).toBeNull();
    });

    it('should get record original XML', async () => {
      const mockRecord = {
        id: '456',
        report: {
          id: '123',
          originalXml: '<xml>test</xml>',
        },
      } as any;

      mockDmarcRecordRepository.findOne.mockResolvedValue(mockRecord);

      const result = await service.getRecordOriginalXml('456');

      expect(result).toBe('<xml>test</xml>');
      expect(mockDmarcRecordRepository.findOne).toHaveBeenCalledWith({
        where: { id: '456' },
        relations: { report: true },
      });
    });

    it('should return null if record not found (getRecordOriginalXml)', async () => {
      mockDmarcRecordRepository.findOne.mockResolvedValue(null);

      const result = await service.getRecordOriginalXml('999');

      expect(result).toBeNull();
    });

    it('should get record by ID', async () => {
      const mockRecord = {
        id: '456',
        sourceIp: '1.2.3.4',
      } as any;

      mockDmarcRecordRepository.findOne.mockResolvedValue(mockRecord);

      const result = await service.getRecordById('456');

      expect(result).toEqual(mockRecord);
      expect(mockDmarcRecordRepository.findOne).toHaveBeenCalledWith({
        where: { id: '456' },
        relations: {
          report: true,
          dkimResults: true,
          spfResults: true,
          policyOverrideReasons: true,
        },
      });
    });
  });

  describe('Delegation to Parser Service', () => {
    it('should delegate parseXmlReport to DmarcParserService', async () => {
      const xmlContent = '<xml>test</xml>';
      const parsedResult = { reportId: 'test', domain: 'example.com' };

      mockDmarcParserService.parseXmlReport.mockResolvedValue(parsedResult);

      const result = await service.parseXmlReport(xmlContent);

      expect(result).toEqual(parsedResult);
      expect(mockDmarcParserService.parseXmlReport).toHaveBeenCalledWith(
        xmlContent,
      );
    });

    it('should delegate unzipReport to DmarcParserService', async () => {
      const buffer = Buffer.from('test');
      const unzippedContent = '<xml>unzipped</xml>';

      mockDmarcParserService.unzipReport.mockResolvedValue(unzippedContent);

      const result = await service.unzipReport(buffer, 'gz');

      expect(result).toEqual(unzippedContent);
      expect(mockDmarcParserService.unzipReport).toHaveBeenCalledWith(
        buffer,
        'gz',
      );
    });
  });

  describe('Delegation to Analytics Service', () => {
    it('should delegate summaryStats to DmarcAnalyticsService', async () => {
      const params = { domain: 'example.com' };
      const stats = {
        totalReports: 100,
        uniqueDomains: 10,
        uniqueReportIds: 50,
      };

      mockDmarcAnalyticsService.summaryStats.mockResolvedValue(stats);

      const result = await service.summaryStats(params);

      expect(result).toEqual(stats);
      expect(mockDmarcAnalyticsService.summaryStats).toHaveBeenCalledWith(
        params,
      );
    });

    it('should delegate timeSeries to DmarcAnalyticsService', async () => {
      const params = { interval: 'day' as const };
      const timeSeries = [{ date: '2024-01-01', count: 10 }];

      mockDmarcAnalyticsService.timeSeries.mockResolvedValue(timeSeries);

      const result = await service.timeSeries(params);

      expect(result).toEqual(timeSeries);
      expect(mockDmarcAnalyticsService.timeSeries).toHaveBeenCalledWith(params);
    });

    it('should delegate topSources to DmarcAnalyticsService', async () => {
      const params = { limit: 10 };
      const sources = [{ source: 'example.com', count: 100 }];

      mockDmarcAnalyticsService.topSources.mockResolvedValue(sources);

      const result = await service.topSources(params);

      expect(result).toEqual(sources);
      expect(mockDmarcAnalyticsService.topSources).toHaveBeenCalledWith(params);
    });

    it('should delegate authSummary to DmarcAnalyticsService', async () => {
      const params = { domain: 'example.com' };
      const summary = {
        total: 1000,
        dkimPass: 800,
        spfPass: 750,
        dmarcPass: 850,
        enforcement: 100,
      };

      mockDmarcAnalyticsService.authSummary.mockResolvedValue(summary);

      const result = await service.authSummary(params);

      expect(result).toEqual(summary);
      expect(mockDmarcAnalyticsService.authSummary).toHaveBeenCalledWith(
        params,
      );
    });

    it('should delegate authBreakdown to DmarcAnalyticsService', async () => {
      const params = { domain: 'example.com' };
      const breakdown = {
        dkim: { pass: 800, fail: 150, missing: 50 },
        spf: { pass: 750, fail: 250 },
      };

      mockDmarcAnalyticsService.authBreakdown.mockResolvedValue(breakdown);

      const result = await service.authBreakdown(params);

      expect(result).toEqual(breakdown);
      expect(mockDmarcAnalyticsService.authBreakdown).toHaveBeenCalledWith(
        params,
      );
    });

    it('should delegate authPassRateTimeseries to DmarcAnalyticsService', async () => {
      const params = { interval: 'day' as const };
      const timeseries = [
        {
          date: '2024-01-01',
          dkimPassRate: 80,
          spfPassRate: 75,
          totalCount: 1000,
          dkimPassCount: 800,
          spfPassCount: 750,
        },
      ];

      mockDmarcAnalyticsService.authPassRateTimeseries.mockResolvedValue(
        timeseries,
      );

      const result = await service.authPassRateTimeseries(params);

      expect(result).toEqual(timeseries);
      expect(
        mockDmarcAnalyticsService.authPassRateTimeseries,
      ).toHaveBeenCalledWith(params);
    });

    it('should delegate dispositionTimeseries to DmarcAnalyticsService', async () => {
      const params = { interval: 'day' as const };
      const timeseries = [
        {
          date: '2024-01-01',
          none: 800,
          quarantine: 150,
          reject: 50,
          total: 1000,
        },
      ];

      mockDmarcAnalyticsService.dispositionTimeseries.mockResolvedValue(
        timeseries,
      );

      const result = await service.dispositionTimeseries(params);

      expect(result).toEqual(timeseries);
      expect(
        mockDmarcAnalyticsService.dispositionTimeseries,
      ).toHaveBeenCalledWith(params);
    });

    it('should delegate authMatrix to DmarcAnalyticsService', async () => {
      const params = { domain: 'example.com' };
      const matrix = {
        dkimPass_spfPass: 700,
        dkimPass_spfFail: 100,
        dkimFail_spfPass: 50,
        dkimFail_spfFail: 150,
      };

      mockDmarcAnalyticsService.authMatrix.mockResolvedValue(matrix);

      const result = await service.authMatrix(params);

      expect(result).toEqual(matrix);
      expect(mockDmarcAnalyticsService.authMatrix).toHaveBeenCalledWith(params);
    });

    it('should delegate topIps to DmarcAnalyticsService', async () => {
      const params = { limit: 10 };
      const ips = [
        {
          ip: '1.2.3.4',
          total: 1000,
          pass: 800,
          fail: 200,
          lastSeen: '2024-01-15',
        },
      ];

      mockDmarcAnalyticsService.topIps.mockResolvedValue(ips);

      const result = await service.topIps(params);

      expect(result).toEqual(ips);
      expect(mockDmarcAnalyticsService.topIps).toHaveBeenCalledWith(params);
    });

    it('should delegate newIps to DmarcAnalyticsService', async () => {
      const params = { limit: 10 };
      const ips = [{ ip: '9.10.11.12', firstSeen: '2024-01-15', count: 10 }];

      mockDmarcAnalyticsService.newIps.mockResolvedValue(ips);

      const result = await service.newIps(params);

      expect(result).toEqual(ips);
      expect(mockDmarcAnalyticsService.newIps).toHaveBeenCalledWith(params);
    });
  });

  describe('Delegation to Geo Analytics Service', () => {
    it('should delegate getTopCountries to DmarcGeoAnalyticsService', async () => {
      const params = { limit: 10 };
      const countries = [
        {
          country: 'US',
          count: 100,
          dmarcPassCount: 80,
          dkimPassCount: 70,
          spfPassCount: 75,
        },
      ];

      mockDmarcGeoAnalyticsService.getTopCountries.mockResolvedValue(countries);

      const result = await service.getTopCountries(params);

      expect(result).toEqual(countries);
      expect(mockDmarcGeoAnalyticsService.getTopCountries).toHaveBeenCalledWith(
        params,
      );
    });

    it('should delegate getTopCountriesPaginated to DmarcGeoAnalyticsService', async () => {
      const params = { page: 1, pageSize: 10 };
      const paginatedCountries = {
        data: [
          {
            country: 'US',
            count: 100,
            dmarcPassCount: 80,
            dkimPassCount: 70,
            spfPassCount: 75,
          },
        ],
        total: 50,
      };

      mockDmarcGeoAnalyticsService.getTopCountriesPaginated.mockResolvedValue(
        paginatedCountries,
      );

      const result = await service.getTopCountriesPaginated(params);

      expect(result).toEqual(paginatedCountries);
      expect(
        mockDmarcGeoAnalyticsService.getTopCountriesPaginated,
      ).toHaveBeenCalledWith(params);
    });

    it('should delegate getGeoHeatmapData to DmarcGeoAnalyticsService', async () => {
      const params = { domain: 'example.com' };
      const heatmap = [
        {
          country: 'US',
          latitude: 37.77,
          longitude: -122.42,
          count: 100,
          passCount: 80,
          failCount: 20,
        },
      ];

      mockDmarcGeoAnalyticsService.getGeoHeatmapData.mockResolvedValue(heatmap);

      const result = await service.getGeoHeatmapData(params);

      expect(result).toEqual(heatmap);
      expect(
        mockDmarcGeoAnalyticsService.getGeoHeatmapData,
      ).toHaveBeenCalledWith(params);
    });

    it('should delegate getTopIpsEnhanced to DmarcGeoAnalyticsService', async () => {
      const params = { page: 1, pageSize: 10 };
      const ips = {
        data: [
          {
            sourceIp: '1.2.3.4',
            count: 100,
            passCount: 80,
            failCount: 20,
            dkimPassCount: 60,
            spfPassCount: 70,
            country: 'US',
            countryName: 'United States',
            city: 'NY',
            latitude: 40.7,
            longitude: -74.0,
          },
        ],
        total: 2,
        page: 1,
        pageSize: 10,
      };

      mockDmarcGeoAnalyticsService.getTopIpsEnhanced.mockResolvedValue(ips);

      const result = await service.getTopIpsEnhanced(params);

      expect(result).toEqual(ips);
      expect(
        mockDmarcGeoAnalyticsService.getTopIpsEnhanced,
      ).toHaveBeenCalledWith(params);
    });

    it('should delegate getTopHeaderFromDomainsPaginated to DmarcGeoAnalyticsService', async () => {
      const params = { page: 1, pageSize: 10 };
      const domains = {
        data: [
          {
            headerFrom: 'a.example.com',
            count: 10,
            dmarcPassCount: 8,
            dkimPassCount: 7,
            spfPassCount: 7,
          },
        ],
        total: 4,
      };

      mockDmarcGeoAnalyticsService.getTopHeaderFromDomainsPaginated.mockResolvedValue(
        domains,
      );

      const result = await service.getTopHeaderFromDomainsPaginated(params);

      expect(result).toEqual(domains);
      expect(
        mockDmarcGeoAnalyticsService.getTopHeaderFromDomainsPaginated,
      ).toHaveBeenCalledWith(params);
    });
  });

  describe('Delegation to Search Service', () => {
    it('should delegate searchRecords to DmarcSearchService', async () => {
      const params = { page: 1, pageSize: 10, domain: 'example.com' };
      const searchResults = {
        data: [{ id: '1', sourceIp: '1.2.3.4' }] as any[],
        total: 1,
        page: 1,
        pageSize: 10,
      };

      mockDmarcSearchService.searchRecords.mockResolvedValue(searchResults);

      const result = await service.searchRecords(params);

      expect(result).toEqual(searchResults);
      expect(mockDmarcSearchService.searchRecords).toHaveBeenCalledWith(params);
    });

    it('should delegate getDistinctValues to DmarcSearchService', async () => {
      const field = 'domain';
      const from = new Date('2024-01-01');
      const to = new Date('2024-12-31');
      const distinctValues = ['example.com', 'test.com'];

      mockDmarcSearchService.getDistinctValues.mockResolvedValue(
        distinctValues,
      );

      const result = await service.getDistinctValues(field, from, to);

      expect(result).toEqual(distinctValues);
      expect(mockDmarcSearchService.getDistinctValues).toHaveBeenCalledWith(
        field,
        from,
        to,
      );
    });

    it('should delegate getDomains to DmarcSearchService', async () => {
      const domains = ['example.com', 'test.com'];

      mockDmarcSearchService.getDomains.mockResolvedValue(domains);

      const result = await service.getDomains();

      expect(result).toEqual(domains);
      expect(mockDmarcSearchService.getDomains).toHaveBeenCalled();
    });

    it('should delegate getReportDomains to DmarcSearchService', async () => {
      const domains = ['example.com', 'test.com'];

      mockDmarcSearchService.getReportDomains.mockResolvedValue(domains);

      const result = await service.getReportDomains();

      expect(result).toEqual(domains);
      expect(mockDmarcSearchService.getReportDomains).toHaveBeenCalled();
    });
  });
});
