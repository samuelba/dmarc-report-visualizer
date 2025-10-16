import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DmarcReportService } from './dmarc-report.service';
import { DmarcReport } from './entities/dmarc-report.entity';
import { DmarcRecord } from './entities/dmarc-record.entity';
import { DkimResult } from './entities/dkim-result.entity';
import { SpfResult } from './entities/spf-result.entity';
import { PolicyOverrideReason } from './entities/policy-override-reason.entity';
import { GeolocationService } from './services/geolocation.service';
import { ForwardingDetectionService } from './services/forwarding-detection.service';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as unzipper from 'unzipper';

describe('DmarcReportService - XML Parsing', () => {
  let service: DmarcReportService;
  let geolocationService: GeolocationService;
  let forwardingDetectionService: ForwardingDetectionService;

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
  const mockGeolocationService = {
    getLocationForIp: jest.fn(),
  };

  const mockForwardingDetectionService = {
    detectForwarding: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmarcReportService,
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
        {
          provide: GeolocationService,
          useValue: mockGeolocationService,
        },
        {
          provide: ForwardingDetectionService,
          useValue: mockForwardingDetectionService,
        },
      ],
    }).compile();

    service = module.get<DmarcReportService>(DmarcReportService);
    geolocationService = module.get<GeolocationService>(GeolocationService);
    forwardingDetectionService = module.get<ForwardingDetectionService>(
      ForwardingDetectionService,
    );

    // Setup default mock responses
    mockGeolocationService.getLocationForIp.mockResolvedValue({
      country: 'US',
      countryName: 'United States',
      city: 'Mountain View',
      latitude: 37.4192,
      longitude: -122.0574,
    });

    mockForwardingDetectionService.detectForwarding.mockResolvedValue({
      isForwarded: false,
      reason: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseXmlReport', () => {
    const testReportsPath = path.join(__dirname, '../../../test/reports');
    const testFileName = 'google.com!example.com!1701129600!1701215999.xml';

    it('should throw BadRequestException for invalid XML content', async () => {
      await expect(service.parseXmlReport('')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.parseXmlReport(null as any)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.parseXmlReport(undefined as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should parse incomplete XML without throwing', async () => {
      // XML parser is forgiving and can parse incomplete tags
      const incompleteXml = '<feedback><report_metadata>';
      const result = await service.parseXmlReport(incompleteXml);

      // Should return empty/undefined fields but not throw
      expect(result).toBeDefined();
      expect(result.records).toEqual([]);
    });

    it('should parse XML report from raw XML file', async () => {
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

      const result = await service.parseXmlReport(xmlContent);

      // Verify report metadata
      expect(result.reportId).toBe('example.com:1701129600');
      expect(result.orgName).toBe('Google');
      expect(result.email).toBe('noreply-dmarc@google.com');
      expect(result.domain).toBe('example.com');

      // Verify dates
      expect(result.beginDate).toEqual(new Date(1701129600 * 1000));
      expect(result.endDate).toEqual(new Date(1701215999 * 1000));

      // Verify policy published
      expect(result.policy).toEqual({
        domain: 'example.com',
        adkim: 'r',
        aspf: 'r',
        p: 'reject',
        sp: 'none',
        pct: 100,
      });

      // Verify records count
      expect(result.records).toBeDefined();
      expect(Array.isArray(result.records)).toBe(true);
      expect(result.records?.length).toBe(8);

      // Verify original XML is stored
      expect(result.originalXml).toBe(xmlContent);
    });

    it('should parse XML report from GZIP file', async () => {
      const gzPath = path.join(testReportsPath, `${testFileName}.gz`);
      const gzContent = fs.readFileSync(gzPath);
      const xmlContent = zlib.gunzipSync(gzContent).toString('utf-8');

      const result = await service.parseXmlReport(xmlContent);

      // Verify basic metadata
      expect(result.reportId).toBe('example.com:1701129600');
      expect(result.orgName).toBe('Google');
      expect(result.domain).toBe('example.com');
      expect(result.records?.length).toBe(8);
    });

    it('should parse XML report from ZIP file', async () => {
      const zipPath = path.join(testReportsPath, `${testFileName}.zip`);

      // Extract XML from ZIP
      const directory = await unzipper.Open.file(zipPath);
      const file = directory.files[0];
      const xmlContent = (await file.buffer()).toString('utf-8');

      const result = await service.parseXmlReport(xmlContent);

      // Verify basic metadata
      expect(result.reportId).toBe('example.com:1701129600');
      expect(result.orgName).toBe('Google');
      expect(result.domain).toBe('example.com');
      expect(result.records?.length).toBe(8);
    });

    it('should produce identical results from XML, GZ, and ZIP files', async () => {
      // Parse raw XML
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      const xmlResult = await service.parseXmlReport(xmlContent);

      // Parse GZ
      const gzPath = path.join(testReportsPath, `${testFileName}.gz`);
      const gzContent = fs.readFileSync(gzPath);
      const gzXmlContent = zlib.gunzipSync(gzContent).toString('utf-8');
      const gzResult = await service.parseXmlReport(gzXmlContent);

      // Parse ZIP
      const zipPath = path.join(testReportsPath, `${testFileName}.zip`);
      const directory = await unzipper.Open.file(zipPath);
      const file = directory.files[0];
      const zipXmlContent = (await file.buffer()).toString('utf-8');
      const zipResult = await service.parseXmlReport(zipXmlContent);

      // Compare all three results (excluding originalXml which might have whitespace differences)
      const { originalXml: _xmlOrig, ...xmlData } = xmlResult;
      const { originalXml: _gzOrig, ...gzData } = gzResult;
      const { originalXml: _zipOrig, ...zipData } = zipResult;

      expect(gzData).toEqual(xmlData);
      expect(zipData).toEqual(xmlData);
    });

    it('should correctly parse all record details', async () => {
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

      const result = await service.parseXmlReport(xmlContent);
      const records = result.records!;

      // Test first record - pass/pass with policy override
      expect(records[0]).toMatchObject({
        sourceIp: '1.2.3.4',
        count: 1,
        disposition: 'none',
        dmarcDkim: 'pass',
        dmarcSpf: 'pass',
        headerFrom: 'example.com',
        reasonType: 'local_policy',
        reasonComment: 'arc=fail',
      });

      // Verify DKIM results for first record
      expect((records[0] as any).dkimResults).toHaveLength(1);
      expect((records[0] as any).dkimResults[0]).toMatchObject({
        domain: 'example.com',
        selector: 'google',
        result: 'pass',
      });

      // Verify SPF results for first record
      expect((records[0] as any).spfResults).toHaveLength(1);
      expect((records[0] as any).spfResults[0]).toMatchObject({
        domain: 'example.com',
        result: 'pass',
      });

      // Verify policy override reasons
      expect((records[0] as any).policyOverrideReasons).toHaveLength(1);
      expect((records[0] as any).policyOverrideReasons[0]).toMatchObject({
        type: 'local_policy',
        comment: 'arc=fail',
      });

      // Test second record - fail DKIM, pass SPF
      expect(records[1]).toMatchObject({
        sourceIp: '1.2.3.5',
        count: 2,
        disposition: 'none',
        dmarcDkim: 'fail',
        dmarcSpf: 'pass',
        headerFrom: 'example.com',
      });

      // Test third record - pass DKIM, fail SPF
      expect(records[2]).toMatchObject({
        sourceIp: '1.2.3.6',
        count: 3,
        disposition: 'none',
        dmarcDkim: 'pass',
        dmarcSpf: 'fail',
        headerFrom: 'example.com',
      });

      // Test fourth record - reject disposition, both fail
      expect(records[3]).toMatchObject({
        sourceIp: '1.2.3.7',
        count: 1,
        disposition: 'reject',
        dmarcDkim: 'fail',
        dmarcSpf: 'fail',
        headerFrom: 'example.com',
      });

      // Test fifth record - missing DKIM results
      expect(records[4]).toMatchObject({
        sourceIp: '1.2.3.8',
        count: 1,
        disposition: 'reject',
        dmarcDkim: 'fail',
        dmarcSpf: 'fail',
      });
      expect((records[4] as any).spfResults).toHaveLength(1);
      expect((records[4] as any).dkimResults).toHaveLength(0);
      expect((records[4] as any).dkimMissing).toBe(true);

      // Test sixth record - missing SPF results
      expect(records[5]).toMatchObject({
        sourceIp: '1.2.3.9',
        count: 1,
        disposition: 'reject',
        dmarcDkim: 'fail',
        dmarcSpf: 'fail',
      });
      expect((records[5] as any).spfResults).toHaveLength(0);
      expect((records[5] as any).dkimResults).toHaveLength(1);

      // Test seventh record - no auth results at all
      expect(records[6]).toMatchObject({
        sourceIp: '1.2.3.10',
        count: 1,
        disposition: 'reject',
        dmarcDkim: 'fail',
        dmarcSpf: 'fail',
      });
      expect((records[6] as any).spfResults).toHaveLength(0);
      expect((records[6] as any).dkimResults).toHaveLength(0);
      expect((records[6] as any).dkimMissing).toBe(true);

      // Test eighth record - multiple DKIM results
      expect(records[7]).toMatchObject({
        sourceIp: '1.2.3.11',
        count: 1,
        disposition: 'none',
        dmarcDkim: 'pass',
        dmarcSpf: 'pass',
      });
      expect((records[7] as any).dkimResults).toHaveLength(2);
      expect((records[7] as any).dkimResults[0]).toMatchObject({
        domain: 'example.com',
        selector: 'google',
        result: 'pass',
      });
      expect((records[7] as any).dkimResults[1]).toMatchObject({
        domain: 'google.com',
        selector: 'google',
        result: 'pass',
      });
    });

    it('should call geolocation service for each record', async () => {
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

      await service.parseXmlReport(xmlContent);

      // Should be called for each of the 8 records
      expect(mockGeolocationService.getLocationForIp).toHaveBeenCalledTimes(8);
      expect(mockGeolocationService.getLocationForIp).toHaveBeenCalledWith(
        '1.2.3.4',
      );
      expect(mockGeolocationService.getLocationForIp).toHaveBeenCalledWith(
        '1.2.3.11',
      );
    });

    it('should add geolocation data to records', async () => {
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

      mockGeolocationService.getLocationForIp.mockResolvedValue({
        country: 'DE',
        countryName: 'Germany',
        city: 'Berlin',
        latitude: 52.52,
        longitude: 13.405,
      });

      const result = await service.parseXmlReport(xmlContent);
      const firstRecord = result.records![0];

      expect(firstRecord.geoCountry).toBe('DE');
      expect(firstRecord.geoCountryName).toBe('Germany');
      expect(firstRecord.geoCity).toBe('Berlin');
      expect(firstRecord.geoLatitude).toBe(52.52);
      expect(firstRecord.geoLongitude).toBe(13.405);
    });

    it('should handle geolocation service errors gracefully', async () => {
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

      mockGeolocationService.getLocationForIp.mockRejectedValue(
        new Error('Geolocation failed'),
      );

      // Should not throw, just log warning
      const result = await service.parseXmlReport(xmlContent);

      expect(result.records).toHaveLength(8);
      expect(result.records![0].geoCountry).toBeUndefined();
    });

    it('should call forwarding detection service for each record', async () => {
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

      await service.parseXmlReport(xmlContent);

      // Should be called for each of the 8 records
      expect(
        mockForwardingDetectionService.detectForwarding,
      ).toHaveBeenCalledTimes(8);
    });

    it('should add forwarding detection results to records', async () => {
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

      mockForwardingDetectionService.detectForwarding.mockResolvedValue({
        isForwarded: true,
        reason: 'spf_fail_dkim_pass',
      });

      const result = await service.parseXmlReport(xmlContent);
      const firstRecord = result.records![0] as any;

      expect(firstRecord.isForwarded).toBe(true);
      expect(firstRecord.forwardReason).toBe('spf_fail_dkim_pass');
      expect(firstRecord.reprocessed).toBe(true);
    });

    it('should handle forwarding detection errors gracefully', async () => {
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

      mockForwardingDetectionService.detectForwarding.mockRejectedValue(
        new Error('Detection failed'),
      );

      // Should not throw, just log warning
      const result = await service.parseXmlReport(xmlContent);

      expect(result.records).toHaveLength(8);
      expect((result.records![0] as any).isForwarded).toBeNull();
      expect((result.records![0] as any).forwardReason).toBeNull();
      expect((result.records![0] as any).reprocessed).toBe(false);
    });

    it('should correctly parse policy published fields', async () => {
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

      const result = await service.parseXmlReport(xmlContent);

      expect(result.policy).toEqual({
        domain: 'example.com',
        adkim: 'r',
        aspf: 'r',
        p: 'reject',
        sp: 'none',
        pct: 100,
      });
    });

    it('should correctly parse dates from epoch timestamps', async () => {
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

      const result = await service.parseXmlReport(xmlContent);

      // 1701129600 = Mon Nov 27 2023 16:00:00 GMT
      expect(result.beginDate?.getTime()).toBe(1701129600 * 1000);
      // 1701215999 = Tue Nov 28 2023 15:59:59 GMT
      expect(result.endDate?.getTime()).toBe(1701215999 * 1000);
    });

    it('should handle records with missing optional fields', async () => {
      const minimalXml = `<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
    <report_metadata>
        <org_name>TestOrg</org_name>
        <report_id>test123</report_id>
        <date_range>
            <begin>1701129600</begin>
            <end>1701215999</end>
        </date_range>
    </report_metadata>
    <policy_published>
        <domain>test.com</domain>
    </policy_published>
    <record>
        <row>
            <source_ip>1.2.3.4</source_ip>
            <count>1</count>
            <policy_evaluated>
                <disposition>none</disposition>
                <dkim>pass</dkim>
                <spf>pass</spf>
            </policy_evaluated>
        </row>
        <identifiers>
            <header_from>test.com</header_from>
        </identifiers>
        <auth_results>
        </auth_results>
    </record>
</feedback>`;

      const result = await service.parseXmlReport(minimalXml);

      expect(result.reportId).toBe('test123');
      expect(result.orgName).toBe('TestOrg');
      expect(result.email).toBeUndefined();
      expect(result.records).toHaveLength(1);
    });

    it('should normalize disposition values to lowercase', async () => {
      const xmlWithUppercase = `<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
    <report_metadata>
        <org_name>TestOrg</org_name>
        <report_id>test123</report_id>
        <date_range>
            <begin>1701129600</begin>
            <end>1701215999</end>
        </date_range>
    </report_metadata>
    <policy_published>
        <domain>test.com</domain>
    </policy_published>
    <record>
        <row>
            <source_ip>1.2.3.4</source_ip>
            <count>1</count>
            <policy_evaluated>
                <disposition>REJECT</disposition>
                <dkim>PASS</dkim>
                <spf>FAIL</spf>
            </policy_evaluated>
        </row>
        <identifiers>
            <header_from>test.com</header_from>
        </identifiers>
        <auth_results>
        </auth_results>
    </record>
</feedback>`;

      const result = await service.parseXmlReport(xmlWithUppercase);

      expect(result.records![0].disposition).toBe('reject');
      expect(result.records![0].dmarcDkim).toBe('pass');
      expect(result.records![0].dmarcSpf).toBe('fail');
    });

    it('should handle count as string and convert to number', async () => {
      const xmlPath = path.join(testReportsPath, testFileName);
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

      const result = await service.parseXmlReport(xmlContent);

      // Count should be converted to number
      expect(typeof result.records![0].count).toBe('number');
      expect(result.records![0].count).toBe(1);
      expect(result.records![1].count).toBe(2);
      expect(result.records![2].count).toBe(3);
    });
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

    it('should delete a report by ID', async () => {
      mockDmarcReportRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove('123');

      expect(mockDmarcReportRepository.delete).toHaveBeenCalledWith('123');
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
        domain: 'example.com',
      };

      const createdReport = { id: '123', ...reportData } as DmarcReport;

      // First findOne returns null (report doesn't exist)
      mockDmarcReportRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createdReport);
      mockDmarcReportRepository.create.mockReturnValue(createdReport);
      mockDmarcReportRepository.save.mockResolvedValue(createdReport);

      const result = await service.createOrUpdateByReportId(reportData);

      expect(mockDmarcReportRepository.findOne).toHaveBeenCalledWith({
        where: { reportId: 'new-report-id' },
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
        records: [],
      } as any;

      const reportData = {
        reportId: 'existing-report-id',
        orgName: 'New Org',
        domain: 'example.com',
        records: [{ sourceIp: '1.2.3.4', count: 1 } as any],
      };

      const updatedReport = {
        ...existingReport,
        orgName: 'New Org',
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
      } as any;

      const reportData = {
        reportId: 'existing-report-id',
        orgName: 'New Org',
      };

      mockDmarcReportRepository.findOne
        .mockResolvedValueOnce(existingReport)
        .mockResolvedValueOnce(null);
      mockDmarcRecordRepository.delete.mockResolvedValue({ affected: 0 });
      mockDmarcReportRepository.update.mockResolvedValue({
        affected: 1,
      } as any);

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

  describe('Statistics and Analytics', () => {
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
        expect(
          mockDmarcRecordRepository.createQueryBuilder,
        ).toHaveBeenCalledWith('rec');
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
        expect(
          mockDmarcRecordRepository.createQueryBuilder,
        ).toHaveBeenCalledWith('rec');
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

  describe('Helper Methods', () => {
    it('should coerce single value to array', () => {
      const value = 'test';
      const result = (service as any).coerceToArray(value);

      expect(result).toEqual(['test']);
    });

    it('should return array as is', () => {
      const value = ['test1', 'test2'];
      const result = (service as any).coerceToArray(value);

      expect(result).toEqual(['test1', 'test2']);
    });

    it('should return empty array for null/undefined', () => {
      const result1 = (service as any).coerceToArray(null);
      const result2 = (service as any).coerceToArray(undefined);

      expect(result1).toEqual([]);
      expect(result2).toEqual([]);
    });
  });

  describe('unzipReport', () => {
    const xmlString = '<root>hello</root>';
    const xmlBuffer = Buffer.from(xmlString, 'utf8');

    it('should return text when type is xml', async () => {
      const result = await service.unzipReport(xmlBuffer, 'xml');
      expect(result).toBe(xmlString);
    });

    it('should decompress gzip when type is gz', async () => {
      const gz = zlib.gzipSync(xmlBuffer);
      const result = await service.unzipReport(gz, 'gz');
      expect(result).toBe(xmlString);
    });

    it('should detect gzip by signature when type is empty', async () => {
      const gz = zlib.gzipSync(xmlBuffer);
      const result = await service.unzipReport(gz, '');
      expect(result).toBe(xmlString);
    });

    it('should read zip and prefer .xml entry (AdmZip path)', async () => {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();
      zip.addFile('nested/ignored.txt', Buffer.from('ignore', 'utf8'));
      zip.addFile('report.xml', xmlBuffer);
      const zipBuffer = zip.toBuffer();

      const result = await service.unzipReport(zipBuffer, 'zip');
      expect(result).toBe(xmlString);
    });

    it('should read zip containing .xml.gz and gunzip (AdmZip path)', async () => {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();
      const gz = zlib.gzipSync(xmlBuffer);
      zip.addFile('report.xml.gz', gz);
      const zipBuffer = zip.toBuffer();

      const result = await service.unzipReport(zipBuffer, 'zip');
      expect(result).toBe(xmlString);
    });

    it('should fallback to first file as text when no xml/gz (AdmZip path)', async () => {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();
      zip.addFile('notes.txt', xmlBuffer);
      const zipBuffer = zip.toBuffer();

      const result = await service.unzipReport(zipBuffer, 'zip');
      expect(result).toBe(xmlString);
    });

    it('should fallback to unzipper when AdmZip reports format error', async () => {
      // Mock adm-zip to throw a format error, and unzipper to succeed
      jest.resetModules();
      jest.doMock('adm-zip', () => {
        return jest.fn().mockImplementation(() => {
          throw new Error('Invalid or unsupported zip format');
        });
      });

      const fakeFile = {
        path: 'inside.xml',
        buffer: jest.fn().mockResolvedValue(xmlBuffer),
        type: 'file',
      } as any;
      const unzipperModule = require('unzipper');
      const openBufferMock = jest
        .spyOn(unzipperModule.Open, 'buffer')
        .mockResolvedValue({ files: [fakeFile] });

      // Re-require the service class to pick up mocks
      const {
        DmarcReportService: FreshService,
      } = require('./dmarc-report.service');
      const freshService = new FreshService(
        mockDmarcReportRepository as unknown as Repository<DmarcReport>,
        mockDmarcRecordRepository as unknown as Repository<DmarcRecord>,
        mockGenericRepository as unknown as Repository<DkimResult>,
        mockGenericRepository as unknown as Repository<SpfResult>,
        mockGenericRepository as unknown as Repository<PolicyOverrideReason>,
        geolocationService,
        forwardingDetectionService,
      );

      const someZipBuffer = Buffer.from('504b0304deadbeef', 'hex'); // looks like zip
      const result = await freshService.unzipReport(someZipBuffer, 'zip');
      expect(result).toBe(xmlString);
      expect(openBufferMock).toHaveBeenCalled();
    });

    it('should throw for invalid buffer', async () => {
      await expect(service.unzipReport(null as any, 'xml')).rejects.toThrow(
        'Invalid file buffer',
      );
      await expect(service.unzipReport({} as any, 'xml')).rejects.toThrow(
        'Invalid file buffer',
      );
    });

    it('should throw for unsupported type when no signatures match', async () => {
      const junk = Buffer.from('not an archive and not xml', 'utf8');
      await expect(service.unzipReport(junk, 'bin')).rejects.toThrow(
        'Unsupported file type',
      );
    });
  });

  describe('Domain helper queries', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('getDomains should combine and deduplicate domains from reports and records', async () => {
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

    it('getReportDomains should return ordered list from reports only', async () => {
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

  describe('Geo and aggregation analytics (additional)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('getTopCountries should return mapped results and honor limit', async () => {
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
            countryname: 'United States',
            count: '100',
            dmarcpasscount: '80',
            dkimpasscount: '70',
            spfpasscount: '75',
          },
          {
            country: 'DE',
            countryname: 'Germany',
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
        countryName: 'United States',
        count: 100,
        dmarcPassCount: 80,
        dkimPassCount: 70,
        spfPassCount: 75,
      });
      expect(qb.limit).toHaveBeenCalledWith(2);
    });

    it('getTopCountries should apply filters (domain, from, to)', async () => {
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

    it('getTopCountriesPaginated should return paginated data and total', async () => {
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
          countryname: 'United States',
          count: '100',
          dmarcpasscount: '80',
          dkimpasscount: '70',
          spfpasscount: '75',
        },
        {
          country: 'DE',
          countryname: 'Germany',
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

    it('getGeoHeatmapData should return mapped heatmap points', async () => {
      const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
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
        latitude: 37.77,
        longitude: -122.42,
        count: 100,
        passCount: 80,
        failCount: 20,
      });
    });

    it('getTopIpsEnhanced should return paginated enhanced IP data', async () => {
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

    it('getTopHeaderFromDomainsPaginated should return paginated headerFrom data', async () => {
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
