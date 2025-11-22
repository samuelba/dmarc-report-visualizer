import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DmarcReportController } from './dmarc-report.controller';
import { DmarcReportService } from './dmarc-report.service';
import { DmarcReport } from './entities/dmarc-report.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('DmarcReportController', () => {
  let controller: DmarcReportController;
  let service: DmarcReportService;

  const mockDmarcReportService = {
    findAll: jest.fn(),
    list: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    deleteOldReports: jest.fn(),
    createOrUpdateByReportId: jest.fn(),
    parseXmlReport: jest.fn(),
    unzipReport: jest.fn(),
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
    getReportOriginalXml: jest.fn(),
    getRecordOriginalXml: jest.fn(),
    getRecordById: jest.fn(),
    getDomains: jest.fn(),
    getReportDomains: jest.fn(),
    getTopCountries: jest.fn(),
    getTopCountriesPaginated: jest.fn(),
    getGeoHeatmapData: jest.fn(),
    getTopIpsEnhanced: jest.fn(),
    getTopHeaderFromDomainsPaginated: jest.fn(),
    getDistinctValues: jest.fn(),
    searchRecords: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DmarcReportController],
      providers: [
        {
          provide: DmarcReportService,
          useValue: mockDmarcReportService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DmarcReportController>(DmarcReportController);
    service = module.get<DmarcReportService>(DmarcReportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic CRUD Operations', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    describe('findAll', () => {
      it('should return all reports', async () => {
        const mockReports = [
          { id: '1', reportId: 'report1' } as DmarcReport,
          { id: '2', reportId: 'report2' } as DmarcReport,
        ];
        mockDmarcReportService.findAll.mockResolvedValue(mockReports);

        const result = await controller.findAll();

        expect(result).toEqual(mockReports);
        expect(mockDmarcReportService.findAll).toHaveBeenCalledTimes(1);
      });
    });

    describe('list', () => {
      it('should list reports with pagination', async () => {
        const mockResult = {
          data: [{ id: '1' } as DmarcReport],
          total: 1,
          page: 1,
          pageSize: 20,
        };
        mockDmarcReportService.list.mockResolvedValue(mockResult);

        const result = await controller.list({
          page: 1,
          pageSize: 20,
        });

        expect(result).toEqual(mockResult);
        expect(mockDmarcReportService.list).toHaveBeenCalledWith({
          domain: undefined,
          from: undefined,
          to: undefined,
          page: 1,
          pageSize: 20,
          sort: undefined,
          order: undefined,
        });
      });

      it('should list reports with domain filter', async () => {
        const mockResult = {
          data: [{ id: '1', domain: 'example.com' } as DmarcReport],
          total: 1,
          page: 1,
          pageSize: 20,
        };
        mockDmarcReportService.list.mockResolvedValue(mockResult);

        await controller.list({
          domain: 'example.com',
          page: 1,
          pageSize: 20,
        });

        expect(mockDmarcReportService.list).toHaveBeenCalledWith(
          expect.objectContaining({
            domain: 'example.com',
          }),
        );
      });

      it('should convert date strings to Date objects', async () => {
        mockDmarcReportService.list.mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
        });

        await controller.list({
          from: '2024-01-01',
          to: '2024-12-31',
        });

        const call = mockDmarcReportService.list.mock.calls[0][0];
        expect(call.from).toBeInstanceOf(Date);
        expect(call.to).toBeInstanceOf(Date);
        expect(call.to?.getHours()).toBe(23);
        expect(call.to?.getMinutes()).toBe(59);
      });
    });

    describe('findOne', () => {
      it('should return a single report by ID', async () => {
        const mockReport = {
          id: 'uuid-123',
          reportId: 'report1',
        } as DmarcReport;
        mockDmarcReportService.findOne.mockResolvedValue(mockReport);

        const result = await controller.findOne('uuid-123');

        expect(result).toEqual(mockReport);
        expect(mockDmarcReportService.findOne).toHaveBeenCalledWith('uuid-123');
      });

      it('should return null if report not found', async () => {
        mockDmarcReportService.findOne.mockResolvedValue(null);

        const result = await controller.findOne('uuid-999');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create a new report', async () => {
        const reportData = {
          reportId: 'new-report',
          domain: 'example.com',
        };
        const createdReport = { id: 'uuid-new', ...reportData } as DmarcReport;
        mockDmarcReportService.create.mockResolvedValue(createdReport);

        const result = await controller.create(reportData);

        expect(result).toEqual(createdReport);
        expect(mockDmarcReportService.create).toHaveBeenCalledWith(reportData);
      });
    });

    describe('update', () => {
      it('should update a report', async () => {
        const updateData = { domain: 'updated.com' };
        const updatedReport = { id: 'uuid-123', ...updateData } as DmarcReport;
        mockDmarcReportService.update.mockResolvedValue(updatedReport);

        const result = await controller.update('uuid-123', updateData);

        expect(result).toEqual(updatedReport);
        expect(mockDmarcReportService.update).toHaveBeenCalledWith(
          'uuid-123',
          updateData,
        );
      });
    });

    describe('remove', () => {
      it('should delete a report', async () => {
        mockDmarcReportService.remove.mockResolvedValue(undefined);

        await controller.remove('uuid-123');

        expect(mockDmarcReportService.remove).toHaveBeenCalledWith('uuid-123');
      });
    });

    describe('deleteOldReports', () => {
      it('should delete old reports and return deleted count', async () => {
        const mockResult = { deletedCount: 150 };
        mockDmarcReportService.deleteOldReports.mockResolvedValue(mockResult);

        const result = await controller.deleteOldReports('2023-01-01');

        expect(result).toEqual(mockResult);
        expect(mockDmarcReportService.deleteOldReports).toHaveBeenCalledWith(
          new Date('2023-01-01'),
        );
      });

      it('should throw BadRequestException if olderThan is missing', async () => {
        await expect(controller.deleteOldReports('')).rejects.toThrow(
          BadRequestException,
        );
        await expect(controller.deleteOldReports('')).rejects.toThrow(
          'olderThan query parameter is required',
        );
      });

      it('should throw BadRequestException if date format is invalid', async () => {
        await expect(
          controller.deleteOldReports('invalid-date'),
        ).rejects.toThrow(BadRequestException);
        await expect(
          controller.deleteOldReports('invalid-date'),
        ).rejects.toThrow('Invalid date format');
      });

      it('should parse date string correctly', async () => {
        const mockResult = { deletedCount: 50 };
        mockDmarcReportService.deleteOldReports.mockResolvedValue(mockResult);

        await controller.deleteOldReports('2024-06-15T12:30:00Z');

        const expectedDate = new Date('2024-06-15T12:30:00Z');
        expect(mockDmarcReportService.deleteOldReports).toHaveBeenCalledWith(
          expectedDate,
        );
      });
    });
  });

  describe('File Upload Operations', () => {
    describe('uploadDmarcReport', () => {
      it('should throw BadRequestException if no file uploaded', async () => {
        await expect(
          controller.uploadDmarcReport(null as unknown as Express.Multer.File),
        ).rejects.toThrow(BadRequestException);
        await expect(
          controller.uploadDmarcReport(null as unknown as Express.Multer.File),
        ).rejects.toThrow('No file uploaded');
      });

      it('should process uploaded XML file', async () => {
        const mockFile = {
          buffer: Buffer.from('<xml>test</xml>'),
          originalname: 'report.xml',
        } as Express.Multer.File;

        const xmlContent = '<xml>test</xml>';
        const parsedData = {
          reportId: 'test-report',
          domain: 'example.com',
        };
        const savedReport = { id: 'uuid-123', ...parsedData } as DmarcReport;

        mockDmarcReportService.unzipReport.mockResolvedValue(xmlContent);
        mockDmarcReportService.parseXmlReport.mockResolvedValue(parsedData);
        mockDmarcReportService.createOrUpdateByReportId.mockResolvedValue(
          savedReport,
        );

        const result = await controller.uploadDmarcReport(mockFile);

        expect(result).toEqual(savedReport);
        expect(mockDmarcReportService.unzipReport).toHaveBeenCalledWith(
          mockFile.buffer,
          'xml',
        );
        expect(mockDmarcReportService.parseXmlReport).toHaveBeenCalledWith(
          xmlContent,
        );
        expect(
          mockDmarcReportService.createOrUpdateByReportId,
        ).toHaveBeenCalled();
      });

      it('should process uploaded GZ file', async () => {
        const mockFile = {
          buffer: Buffer.from('gzip-data'),
          originalname: 'report.xml.gz',
        } as Express.Multer.File;

        mockDmarcReportService.unzipReport.mockResolvedValue('<xml>test</xml>');
        mockDmarcReportService.parseXmlReport.mockResolvedValue({});
        mockDmarcReportService.createOrUpdateByReportId.mockResolvedValue(
          {} as any,
        );

        await controller.uploadDmarcReport(mockFile);

        expect(mockDmarcReportService.unzipReport).toHaveBeenCalledWith(
          mockFile.buffer,
          'gz',
        );
      });

      it('should process uploaded ZIP file', async () => {
        const mockFile = {
          buffer: Buffer.from('zip-data'),
          originalname: 'report.xml.zip',
        } as Express.Multer.File;

        mockDmarcReportService.unzipReport.mockResolvedValue('<xml>test</xml>');
        mockDmarcReportService.parseXmlReport.mockResolvedValue({});
        mockDmarcReportService.createOrUpdateByReportId.mockResolvedValue(
          {} as any,
        );

        await controller.uploadDmarcReport(mockFile);

        expect(mockDmarcReportService.unzipReport).toHaveBeenCalledWith(
          mockFile.buffer,
          'zip',
        );
      });
    });
  });

  describe('Statistics Endpoints', () => {
    describe('summary', () => {
      it('should return summary statistics', async () => {
        const mockStats = {
          totalReports: 100,
          uniqueDomains: 10,
          uniqueReportIds: 50,
        };
        mockDmarcReportService.summaryStats.mockResolvedValue(mockStats);

        const result = await controller.summary({});

        expect(result).toEqual(mockStats);
        expect(mockDmarcReportService.summaryStats).toHaveBeenCalledWith({
          domain: undefined,
          from: undefined,
          to: undefined,
        });
      });

      it('should filter summary statistics by domain', async () => {
        mockDmarcReportService.summaryStats.mockResolvedValue({
          totalReports: 50,
          uniqueDomains: 5,
          uniqueReportIds: 25,
        });

        await controller.summary({ domain: 'example.com' });

        expect(mockDmarcReportService.summaryStats).toHaveBeenCalledWith({
          domain: 'example.com',
          from: undefined,
          to: undefined,
        });
      });

      it('should filter summary statistics by date range', async () => {
        mockDmarcReportService.summaryStats.mockResolvedValue({});

        await controller.summary({
          from: '2024-01-01',
          to: '2024-12-31',
        });

        const call = mockDmarcReportService.summaryStats.mock.calls[0][0];
        expect(call.from).toBeInstanceOf(Date);
        expect(call.to).toBeInstanceOf(Date);
      });
    });

    describe('timeseries', () => {
      it('should return time series data', async () => {
        const mockData = [
          { date: '2024-01-01', count: 10 },
          { date: '2024-01-02', count: 15 },
        ];
        mockDmarcReportService.timeSeries.mockResolvedValue(mockData);

        const result = await controller.timeseries({ interval: 'day' });

        expect(result).toEqual(mockData);
        expect(mockDmarcReportService.timeSeries).toHaveBeenCalledWith({
          domain: undefined,
          from: undefined,
          to: undefined,
          interval: 'day',
        });
      });

      it('should default to day interval', async () => {
        mockDmarcReportService.timeSeries.mockResolvedValue([]);

        await controller.timeseries({});

        expect(mockDmarcReportService.timeSeries).toHaveBeenCalledWith(
          expect.objectContaining({ interval: 'day' }),
        );
      });

      it('should support week interval', async () => {
        mockDmarcReportService.timeSeries.mockResolvedValue([]);

        await controller.timeseries({ interval: 'week' });

        expect(mockDmarcReportService.timeSeries).toHaveBeenCalledWith(
          expect.objectContaining({ interval: 'week' }),
        );
      });
    });

    describe('topSources', () => {
      it('should return top sources', async () => {
        const mockData = [
          { source: 'example.com', count: 100 },
          { source: 'test.com', count: 50 },
        ];
        mockDmarcReportService.topSources.mockResolvedValue(mockData);

        const result = await controller.topSources({});

        expect(result).toEqual(mockData);
        expect(mockDmarcReportService.topSources).toHaveBeenCalledWith({
          domain: undefined,
          from: undefined,
          to: undefined,
          limit: 10,
        });
      });

      it('should use custom limit', async () => {
        mockDmarcReportService.topSources.mockResolvedValue([]);

        await controller.topSources({ limit: 25 });

        expect(mockDmarcReportService.topSources).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 25 }),
        );
      });
    });

    describe('authSummary', () => {
      it('should return authentication summary', async () => {
        const mockData = {
          total: 1000,
          dkimPass: 800,
          spfPass: 750,
          dmarcPass: 850,
          enforcement: 100,
        };
        mockDmarcReportService.authSummary.mockResolvedValue(mockData);

        const result = await controller.authSummary({});

        expect(result).toEqual(mockData);
        expect(mockDmarcReportService.authSummary).toHaveBeenCalled();
      });
    });

    describe('authBreakdown', () => {
      it('should return authentication breakdown', async () => {
        const mockData = {
          dkim: { pass: 800, fail: 150, missing: 50 },
          spf: { pass: 750, fail: 250 },
        };
        mockDmarcReportService.authBreakdown.mockResolvedValue(mockData);

        const result = await controller.authBreakdown({});

        expect(result).toEqual(mockData);
        expect(mockDmarcReportService.authBreakdown).toHaveBeenCalled();
      });
    });

    describe('authPassRateTimeseries', () => {
      it('should return auth pass rate time series', async () => {
        const mockData = [
          {
            date: '2024-01-01',
            totalCount: 1000,
            dkimPassCount: 800,
            spfPassCount: 750,
            dkimPassRate: 80,
            spfPassRate: 75,
          },
        ];
        mockDmarcReportService.authPassRateTimeseries.mockResolvedValue(
          mockData,
        );

        const result = await controller.authPassRateTimeseries({
          interval: 'day',
        });

        expect(result).toEqual(mockData);
      });
    });

    describe('dispositionTimeseries', () => {
      it('should return disposition time series', async () => {
        const mockData = [
          {
            date: '2024-01-01',
            none: 800,
            quarantine: 150,
            reject: 50,
            total: 1000,
          },
        ];
        mockDmarcReportService.dispositionTimeseries.mockResolvedValue(
          mockData,
        );

        const result = await controller.dispositionTimeseries({
          interval: 'day',
        });

        expect(result).toEqual(mockData);
      });
    });

    describe('authMatrix', () => {
      it('should return authentication matrix', async () => {
        const mockData = {
          dkimPass_spfPass: 700,
          dkimPass_spfFail: 100,
          dkimFail_spfPass: 50,
          dkimFail_spfFail: 150,
        };
        mockDmarcReportService.authMatrix.mockResolvedValue(mockData);

        const result = await controller.authMatrix({});

        expect(result).toEqual(mockData);
      });
    });

    describe('topIps', () => {
      it('should return top IPs', async () => {
        const mockData = [
          {
            ip: '1.2.3.4',
            total: 1000,
            pass: 800,
            fail: 200,
            lastSeen: '2024-01-15',
          },
        ];
        mockDmarcReportService.topIps.mockResolvedValue(mockData);

        const result = await controller.topIps();

        expect(result).toEqual(mockData);
        expect(mockDmarcReportService.topIps).toHaveBeenCalledWith({
          domain: undefined,
          from: undefined,
          to: undefined,
          limit: 10,
        });
      });

      it('should parse limit as integer', async () => {
        mockDmarcReportService.topIps.mockResolvedValue([]);

        await controller.topIps(undefined, undefined, undefined, '25');

        expect(mockDmarcReportService.topIps).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 25 }),
        );
      });
    });

    describe('newIps', () => {
      it('should return new IPs', async () => {
        const mockData = [
          { ip: '9.10.11.12', firstSeen: '2024-01-15', count: 10 },
        ];
        mockDmarcReportService.newIps.mockResolvedValue(mockData);

        const result = await controller.newIps();

        expect(result).toEqual(mockData);
      });
    });
  });

  describe('XML Retrieval Endpoints', () => {
    describe('getReportXml', () => {
      it('should return XML for a report', async () => {
        const xmlContent = '<xml>test</xml>';
        mockDmarcReportService.getReportOriginalXml.mockResolvedValue(
          xmlContent,
        );

        const result = await controller.getReportXml('uuid-123');

        expect(result).toBe(xmlContent);
        expect(
          mockDmarcReportService.getReportOriginalXml,
        ).toHaveBeenCalledWith('uuid-123');
      });

      it('should return message if no XML stored', async () => {
        mockDmarcReportService.getReportOriginalXml.mockResolvedValue(null);

        const result = await controller.getReportXml('uuid-123');

        expect(result).toEqual({ message: 'No XML stored for this report' });
      });
    });

    describe('getRecordXml', () => {
      it('should return XML for a record', async () => {
        const xmlContent = '<xml>record</xml>';
        mockDmarcReportService.getRecordOriginalXml.mockResolvedValue(
          xmlContent,
        );

        const result = await controller.getRecordXml('uuid-456');

        expect(result).toBe(xmlContent);
      });

      it('should return message if no XML stored', async () => {
        mockDmarcReportService.getRecordOriginalXml.mockResolvedValue(null);

        const result = await controller.getRecordXml('uuid-456');

        expect(result).toEqual({ message: 'No XML stored for this record' });
      });
    });
  });

  describe('Domain Endpoints', () => {
    describe('getDomains', () => {
      it('should return list of domains', async () => {
        const mockDomains = ['example.com', 'test.com'];
        mockDmarcReportService.getDomains.mockResolvedValue(mockDomains);

        const result = await controller.getDomains();

        expect(result).toEqual({ domains: mockDomains });
        expect(mockDmarcReportService.getDomains).toHaveBeenCalled();
      });
    });

    describe('getReportDomains', () => {
      it('should return list of report domains', async () => {
        const mockDomains = ['google.com', 'outlook.com'];
        mockDmarcReportService.getReportDomains.mockResolvedValue(mockDomains);

        const result = await controller.getReportDomains();

        expect(result).toEqual({ domains: mockDomains });
      });
    });
  });

  describe('Geographic Data Endpoints', () => {
    describe('getTopCountries', () => {
      it('should return top countries with limit', async () => {
        const mockData = [
          {
            country: 'US',
            count: 1000,
            dmarcPassCount: 800,
            dkimPassCount: 750,
            spfPassCount: 700,
          },
        ];
        mockDmarcReportService.getTopCountries.mockResolvedValue(mockData);

        const result = await controller.getTopCountries(
          undefined,
          undefined,
          undefined,
          '10',
        );

        expect(result).toEqual(mockData);
        expect(mockDmarcReportService.getTopCountries).toHaveBeenCalledWith({
          domain: undefined,
          from: undefined,
          to: undefined,
          limit: 10,
        });
      });

      it('should return paginated top countries', async () => {
        const mockData = {
          data: [
            {
              country: 'US',
              count: 1000,
              dmarcPassCount: 800,
              dkimPassCount: 750,
              spfPassCount: 700,
            },
          ],
          total: 100,
        };
        mockDmarcReportService.getTopCountriesPaginated.mockResolvedValue(
          mockData,
        );

        const result = await controller.getTopCountries(
          undefined,
          undefined,
          undefined,
          undefined,
          '1',
          '20',
        );

        expect(result).toEqual(mockData);
        expect(
          mockDmarcReportService.getTopCountriesPaginated,
        ).toHaveBeenCalledWith({
          domain: undefined,
          from: undefined,
          to: undefined,
          page: 1,
          pageSize: 20,
        });
      });
    });

    describe('getGeoHeatmap', () => {
      it('should return geo heatmap data aggregated by country', async () => {
        const mockData = [
          {
            country: 'US',
            latitude: 37.4192,
            longitude: -122.0574,
            count: 100,
            passCount: 80,
            failCount: 20,
          },
        ];
        mockDmarcReportService.getGeoHeatmapData.mockResolvedValue(mockData);

        const result = await controller.getGeoHeatmap();

        expect(result).toEqual(mockData);
        expect(mockDmarcReportService.getGeoHeatmapData).toHaveBeenCalled();
      });

      it('should filter by domain and dates', async () => {
        mockDmarcReportService.getGeoHeatmapData.mockResolvedValue([]);

        await controller.getGeoHeatmap(
          'example.com',
          '2024-01-01',
          '2024-12-31',
        );

        const call = mockDmarcReportService.getGeoHeatmapData.mock.calls[0][0];
        expect(call.domain).toBe('example.com');
        expect(call.from).toBeInstanceOf(Date);
        expect(call.to).toBeInstanceOf(Date);
      });
    });

    describe('getTopIpsEnhanced', () => {
      it('should return enhanced top IPs data', async () => {
        const mockData = {
          data: [
            {
              sourceIp: '1.2.3.4',
              count: 100,
              passCount: 80,
              failCount: 20,
              dkimPassCount: 75,
              spfPassCount: 70,
              country: 'US',
              countryName: 'United States',
              city: 'Mountain View',
              latitude: 37.4192,
              longitude: -122.0574,
            },
          ],
          total: 500,
          page: 1,
          pageSize: 10,
        };
        mockDmarcReportService.getTopIpsEnhanced.mockResolvedValue(mockData);

        const result = await controller.getTopIpsEnhanced();

        expect(result).toEqual(mockData);
      });

      it('should parse pagination parameters', async () => {
        mockDmarcReportService.getTopIpsEnhanced.mockResolvedValue({
          data: [],
          total: 0,
          page: 2,
          pageSize: 50,
        });

        await controller.getTopIpsEnhanced(
          undefined,
          undefined,
          undefined,
          '2',
          '50',
        );

        expect(mockDmarcReportService.getTopIpsEnhanced).toHaveBeenCalledWith(
          expect.objectContaining({ page: 2, pageSize: 50 }),
        );
      });
    });
  });

  describe('Advanced Query Endpoints', () => {
    describe('getTopHeaderFrom', () => {
      it('should return top header from domains', async () => {
        const mockData = {
          data: [
            {
              headerFrom: 'example.com',
              count: 1000,
              dmarcPassCount: 800,
              dkimPassCount: 750,
              spfPassCount: 700,
            },
          ],
          total: 50,
        };
        mockDmarcReportService.getTopHeaderFromDomainsPaginated.mockResolvedValue(
          mockData,
        );

        const result = await controller.getTopHeaderFrom();

        expect(result).toMatchObject({
          data: mockData.data,
          total: 50,
          page: 1,
          pageSize: 10,
        });
      });
    });

    describe('getDistinct', () => {
      it('should return distinct values for a field', async () => {
        const mockValues = ['example.com', 'test.com'];
        mockDmarcReportService.getDistinctValues.mockResolvedValue(mockValues);

        const result = await controller.getDistinct('domain');

        expect(result).toEqual(mockValues);
        expect(mockDmarcReportService.getDistinctValues).toHaveBeenCalledWith(
          'domain',
          undefined,
          undefined,
        );
      });

      it('should support date filtering', async () => {
        mockDmarcReportService.getDistinctValues.mockResolvedValue([]);

        await controller.getDistinct('sourceIp', '2024-01-01', '2024-12-31');

        const call = mockDmarcReportService.getDistinctValues.mock.calls[0];
        expect(call[1]).toBeInstanceOf(Date);
        expect(call[2]).toBeInstanceOf(Date);
      });
    });

    describe('getRecordById', () => {
      it('should return a record by ID', async () => {
        const mockRecord = { id: 'uuid-456', sourceIp: '1.2.3.4' };
        mockDmarcReportService.getRecordById.mockResolvedValue(mockRecord);

        const result = await controller.getRecordById('uuid-456');

        expect(result).toEqual(mockRecord);
        expect(mockDmarcReportService.getRecordById).toHaveBeenCalledWith(
          'uuid-456',
        );
      });
    });

    describe('searchRecords', () => {
      it('should search records with default parameters', async () => {
        const mockResult = {
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
        };
        mockDmarcReportService.searchRecords.mockResolvedValue(mockResult);

        const result = await controller.searchRecords();

        expect(result).toEqual(mockResult);
        expect(mockDmarcReportService.searchRecords).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 1,
            pageSize: 20,
          }),
        );
      });

      it('should search records with filters', async () => {
        mockDmarcReportService.searchRecords.mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
        });

        await controller.searchRecords(
          '1',
          '20',
          'example.com',
          'Google',
          '2024-01-01',
          '2024-12-31',
          'none',
          'pass',
          'fail',
        );

        expect(mockDmarcReportService.searchRecords).toHaveBeenCalledWith(
          expect.objectContaining({
            page: 1,
            pageSize: 20,
            domain: 'example.com',
            disposition: ['none'],
            dkim: ['pass'],
            spf: ['fail'],
          }),
        );
      });

      it('should handle isForwarded parameter correctly', async () => {
        mockDmarcReportService.searchRecords.mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
        });

        await controller.searchRecords(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'true',
        );

        const call = mockDmarcReportService.searchRecords.mock.calls[0][0];
        expect(call.isForwarded).toBe(true);
      });

      it('should handle isForwarded=false parameter', async () => {
        mockDmarcReportService.searchRecords.mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
        });

        await controller.searchRecords(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'false',
        );

        const call = mockDmarcReportService.searchRecords.mock.calls[0][0];
        expect(call.isForwarded).toBe(false);
      });

      it('should handle isForwarded=null parameter', async () => {
        mockDmarcReportService.searchRecords.mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
        });

        await controller.searchRecords(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'null',
        );

        const call = mockDmarcReportService.searchRecords.mock.calls[0][0];
        expect(call.isForwarded).toBeNull();
      });

      it('should coerce single values to arrays', async () => {
        mockDmarcReportService.searchRecords.mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          pageSize: 20,
        });

        await controller.searchRecords(
          undefined,
          undefined,
          undefined,
          'Google', // Single string value
        );

        const call = mockDmarcReportService.searchRecords.mock.calls[0][0];
        expect(call.orgName).toEqual(['Google']);
      });
    });
  });

  describe('Test Endpoints', () => {
    describe('testEndpoint', () => {
      it('should return test message', async () => {
        const result = await controller.testEndpoint();

        expect(result).toEqual({ message: 'Test endpoint working!' });
      });
    });

    describe('testNewEndpoint', () => {
      it('should return stats test message', async () => {
        const result = await controller.testNewEndpoint();

        expect(result).toEqual({ message: 'New endpoint working in stats!' });
      });
    });
  });

  describe('Helper Methods', () => {
    it('should make to date inclusive', () => {
      const controller = new DmarcReportController(service);
      const result = (controller as any).makeToDateInclusive('2024-12-31');

      expect(result).toBeInstanceOf(Date);
      expect(result?.getHours()).toBe(23);
      expect(result?.getMinutes()).toBe(59);
      expect(result?.getSeconds()).toBe(59);
      expect(result?.getMilliseconds()).toBe(999);
    });

    it('should return undefined for undefined date string', () => {
      const controller = new DmarcReportController(service);
      const result = (controller as any).makeToDateInclusive(undefined);

      expect(result).toBeUndefined();
    });
  });
});
