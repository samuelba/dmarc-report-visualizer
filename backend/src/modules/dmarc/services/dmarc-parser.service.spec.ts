import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DmarcParserService } from './dmarc-parser.service';
import { GeolocationService } from './geolocation.service';
import { ForwardingDetectionService } from './forwarding-detection.service';
import { IpLookupQueueService } from './ip-lookup-queue.service';
import * as zlib from 'zlib';

describe('DmarcParserService', () => {
  let service: DmarcParserService;

  const mockGeolocationService = {
    getLocationForIp: jest.fn(),
  };

  const mockForwardingDetectionService = {
    detectForwarding: jest.fn(),
  };

  const mockIpLookupQueueService = {
    addToQueue: jest.fn(),
    processQueue: jest.fn(),
    getQueueStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmarcParserService,
        {
          provide: GeolocationService,
          useValue: mockGeolocationService,
        },
        {
          provide: ForwardingDetectionService,
          useValue: mockForwardingDetectionService,
        },
        {
          provide: IpLookupQueueService,
          useValue: mockIpLookupQueueService,
        },
      ],
    }).compile();

    service = module.get<DmarcParserService>(DmarcParserService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parseXmlReport', () => {
    const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>12345678901234567890</report_id>
    <date_range>
      <begin>1234567890</begin>
      <end>1234654290</end>
    </date_range>
  </report_metadata>
  <policy_published>
    <domain>example.com</domain>
    <adkim>r</adkim>
    <aspf>r</aspf>
    <p>none</p>
    <sp>none</sp>
    <pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>192.0.2.1</source_ip>
      <count>5</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>pass</dkim>
        <spf>pass</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>example.com</header_from>
      <envelope_from>bounce.example.com</envelope_from>
      <envelope_to>recipient@example.com</envelope_to>
    </identifiers>
    <auth_results>
      <dkim>
        <domain>example.com</domain>
        <selector>default</selector>
        <result>pass</result>
      </dkim>
      <spf>
        <domain>example.com</domain>
        <result>pass</result>
      </spf>
    </auth_results>
  </record>
</feedback>`;

    beforeEach(() => {
      // Disable async IP lookup for tests so we can verify synchronous behavior
      service.setAsyncIpLookup(false);

      mockGeolocationService.getLocationForIp.mockResolvedValue({
        country: 'US',
        countryName: 'United States',
        city: 'San Francisco',
        latitude: 37.7749,
        longitude: -122.4194,
      });

      mockForwardingDetectionService.detectForwarding.mockResolvedValue({
        isForwarded: false,
        reason: null,
      });
    });

    it('should parse valid XML report successfully', async () => {
      const result = await service.parseXmlReport(validXml);

      expect(result).toBeDefined();
      expect(result.reportId).toBe('12345678901234567890');
      expect(result.orgName).toBe('google.com');
      expect(result.email).toBe('noreply-dmarc-support@google.com');
      expect(result.domain).toBe('example.com');
      expect(result.beginDate).toEqual(new Date(1234567890 * 1000));
      expect(result.endDate).toEqual(new Date(1234654290 * 1000));
      expect(result.originalXml).toBe(validXml);
    });

    it('should parse records correctly', async () => {
      const result = await service.parseXmlReport(validXml);

      expect(result.records).toHaveLength(1);
      const record = result.records![0];
      expect(record.sourceIp).toBe('192.0.2.1');
      expect(record.count).toBe(5);
      expect(record.disposition).toBe('none');
      expect(record.dmarcDkim).toBe('pass');
      expect(record.dmarcSpf).toBe('pass');
      expect(record.headerFrom).toBe('example.com');
      expect(record.envelopeFrom).toBe('bounce.example.com');
      expect(record.envelopeTo).toBe('recipient@example.com');
    });

    it('should parse DKIM results correctly', async () => {
      const result = await service.parseXmlReport(validXml);

      const record = result.records![0];
      expect((record as any).dkimResults).toHaveLength(1);
      expect((record as any).dkimResults[0]).toEqual({
        domain: 'example.com',
        selector: 'default',
        result: 'pass',
        humanResult: undefined,
      });
      expect((record as any).dkimMissing).toBe(false);
    });

    it('should parse SPF results correctly', async () => {
      const result = await service.parseXmlReport(validXml);

      const record = result.records![0];
      expect((record as any).spfResults).toHaveLength(1);
      expect((record as any).spfResults[0]).toEqual({
        domain: 'example.com',
        result: 'pass',
      });
    });

    it('should add geolocation data for source IP', async () => {
      const result = await service.parseXmlReport(validXml);

      expect(mockGeolocationService.getLocationForIp).toHaveBeenCalledWith(
        '192.0.2.1',
      );
      const record = result.records![0];
      expect(record.geoCountry).toBe('US');
      expect(record.geoCountryName).toBe('United States');
      expect(record.geoCity).toBe('San Francisco');
      expect(record.geoLatitude).toBe(37.7749);
      expect(record.geoLongitude).toBe(-122.4194);
    });

    it('should detect forwarding status', async () => {
      const result = await service.parseXmlReport(validXml);

      expect(
        mockForwardingDetectionService.detectForwarding,
      ).toHaveBeenCalled();
      const record = result.records![0];
      expect((record as any).isForwarded).toBe(false);
      expect((record as any).forwardReason).toBeNull();
      expect((record as any).reprocessed).toBe(true);
    });

    it('should handle geolocation errors gracefully', async () => {
      mockGeolocationService.getLocationForIp.mockRejectedValue(
        new Error('Geolocation failed'),
      );

      const result = await service.parseXmlReport(validXml);

      const record = result.records![0];
      expect(record.geoCountry).toBeUndefined();
      expect(record.geoCity).toBeUndefined();
    });

    it('should handle forwarding detection errors gracefully', async () => {
      mockForwardingDetectionService.detectForwarding.mockRejectedValue(
        new Error('Detection failed'),
      );

      const result = await service.parseXmlReport(validXml);

      const record = result.records![0];
      expect((record as any).isForwarded).toBeNull();
      expect((record as any).forwardReason).toBeNull();
      expect((record as any).reprocessed).toBe(false);
    });

    it('should throw BadRequestException for invalid XML content', async () => {
      await expect(
        service.parseXmlReport(null as unknown as string),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.parseXmlReport(undefined as unknown as string),
      ).rejects.toThrow(BadRequestException);
      await expect(service.parseXmlReport('')).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.parseXmlReport(123 as unknown as string),
      ).rejects.toThrow(BadRequestException);
    });

    it('should parse malformed but parseable XML', async () => {
      // Note: fast-xml-parser is quite tolerant and won't throw for unclosed tags
      // It will just parse what it can. This is the expected behavior.
      const malformedXml = '<invalid>xml<without>closing</tags>';

      const result = await service.parseXmlReport(malformedXml);

      // Should return a result with undefined/empty values since the XML structure doesn't match DMARC spec
      expect(result).toBeDefined();
      expect(result.reportId).toBeUndefined();
    });

    it('should parse multiple records', async () => {
      const multiRecordXml = `<?xml version="1.0"?>
<feedback>
  <report_metadata>
    <org_name>test.com</org_name>
    <report_id>test123</report_id>
    <date_range><begin>1000000000</begin><end>1000086400</end></date_range>
  </report_metadata>
  <policy_published><domain>example.com</domain></policy_published>
  <record>
    <row>
      <source_ip>192.0.2.1</source_ip>
      <count>1</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from></identifiers>
    <auth_results><dkim><domain>example.com</domain><result>pass</result></dkim></auth_results>
  </record>
  <record>
    <row>
      <source_ip>192.0.2.2</source_ip>
      <count>2</count>
      <policy_evaluated><disposition>quarantine</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from></identifiers>
    <auth_results><dkim><domain>example.com</domain><result>fail</result></dkim></auth_results>
  </record>
</feedback>`;

      const result = await service.parseXmlReport(multiRecordXml);

      expect(result.records).toHaveLength(2);
      expect(result.records![0].sourceIp).toBe('192.0.2.1');
      expect(result.records![0].count).toBe(1);
      expect(result.records![1].sourceIp).toBe('192.0.2.2');
      expect(result.records![1].count).toBe(2);
      expect(result.records![1].disposition).toBe('quarantine');
    });

    it('should handle missing DKIM results (dkimMissing flag)', async () => {
      const noDkimXml = `<?xml version="1.0"?>
<feedback>
  <report_metadata>
    <org_name>test.com</org_name>
    <report_id>test123</report_id>
    <date_range><begin>1000000000</begin><end>1000086400</end></date_range>
  </report_metadata>
  <policy_published><domain>example.com</domain></policy_published>
  <record>
    <row>
      <source_ip>192.0.2.1</source_ip>
      <count>1</count>
      <policy_evaluated><disposition>none</disposition><dkim>fail</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from></identifiers>
    <auth_results></auth_results>
  </record>
</feedback>`;

      const result = await service.parseXmlReport(noDkimXml);

      const record = result.records![0];
      expect((record as any).dkimMissing).toBe(true);
      expect((record as any).dkimResults).toHaveLength(0);
    });

    it('should parse policy override reasons', async () => {
      const reasonXml = `<?xml version="1.0"?>
<feedback>
  <report_metadata>
    <org_name>test.com</org_name>
    <report_id>test123</report_id>
    <date_range><begin>1000000000</begin><end>1000086400</end></date_range>
  </report_metadata>
  <policy_published><domain>example.com</domain></policy_published>
  <record>
    <row>
      <source_ip>192.0.2.1</source_ip>
      <count>1</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>pass</dkim>
        <spf>pass</spf>
        <reason>
          <type>forwarded</type>
          <comment>Message was forwarded</comment>
        </reason>
      </policy_evaluated>
    </row>
    <identifiers><header_from>example.com</header_from></identifiers>
    <auth_results></auth_results>
  </record>
</feedback>`;

      const result = await service.parseXmlReport(reasonXml);

      const record = result.records![0];
      expect(record.reasonType).toBe('forwarded');
      expect(record.reasonComment).toBe('Message was forwarded');
      expect((record as any).policyOverrideReasons).toHaveLength(1);
      expect((record as any).policyOverrideReasons[0]).toEqual({
        type: 'forwarded',
        comment: 'Message was forwarded',
      });
    });
  });

  describe('unzipReport', () => {
    it('should return plain XML content directly', async () => {
      const xmlContent = '<?xml version="1.0"?><test>data</test>';
      const buffer = Buffer.from(xmlContent);

      const result = await service.unzipReport(buffer, 'xml');

      expect(result).toBe(xmlContent);
    });

    it('should return plain text content directly', async () => {
      const textContent = 'plain text content';
      const buffer = Buffer.from(textContent);

      const result = await service.unzipReport(buffer, 'txt');

      expect(result).toBe(textContent);
    });

    it('should decompress gzip files', async () => {
      const xmlContent = '<?xml version="1.0"?><test>gzipped data</test>';
      const gzipped = zlib.gzipSync(Buffer.from(xmlContent));

      const result = await service.unzipReport(gzipped, 'gz');

      expect(result).toBe(xmlContent);
    });

    it('should detect gzip by signature even with wrong extension', async () => {
      const xmlContent = '<?xml version="1.0"?><test>gzipped data</test>';
      const gzipped = zlib.gzipSync(Buffer.from(xmlContent));

      const result = await service.unzipReport(gzipped, 'zip');

      expect(result).toBe(xmlContent);
    });

    it('should throw BadRequestException for invalid buffer', async () => {
      await expect(
        service.unzipReport(null as unknown as Buffer, 'xml'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.unzipReport(undefined as unknown as Buffer, 'xml'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.unzipReport('not a buffer' as unknown as Buffer, 'xml'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for failed gzip decompression', async () => {
      const invalidGzip = Buffer.from('not gzipped content');

      await expect(service.unzipReport(invalidGzip, 'gz')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for unsupported file type', async () => {
      const buffer = Buffer.from('some content');

      await expect(service.unzipReport(buffer, 'pdf')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.unzipReport(buffer, 'exe')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle empty file type', async () => {
      const xmlContent = '<?xml version="1.0"?><test>data</test>';
      const buffer = Buffer.from(xmlContent);

      // With empty type, it should attempt signature detection
      // Since it's not ZIP or GZIP, it should throw unsupported type
      await expect(service.unzipReport(buffer, '')).rejects.toThrow(
        BadRequestException,
      );
    });

    // Note: Comprehensive ZIP testing would require actual ZIP file creation
    // which is complex. The AdmZip library is tested indirectly through integration tests.
  });

  describe('helper methods', () => {
    describe('isZipBuffer', () => {
      it('should detect ZIP signature', () => {
        // ZIP files start with 'PK' (0x50 0x4B)
        const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
        expect((service as any).isZipBuffer(zipBuffer)).toBe(true);
      });

      it('should return false for non-ZIP buffers', () => {
        const nonZipBuffer = Buffer.from([0x1f, 0x8b, 0x00, 0x00]);
        expect((service as any).isZipBuffer(nonZipBuffer)).toBe(false);
      });

      it('should return false for too-short buffers', () => {
        const shortBuffer = Buffer.from([0x50]);
        expect((service as any).isZipBuffer(shortBuffer)).toBe(false);
      });
    });

    describe('isGzipBuffer', () => {
      it('should detect GZIP signature', () => {
        // GZIP files start with 0x1F 0x8B
        const gzipBuffer = Buffer.from([0x1f, 0x8b, 0x00, 0x00]);
        expect((service as any).isGzipBuffer(gzipBuffer)).toBe(true);
      });

      it('should return false for non-GZIP buffers', () => {
        const nonGzipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
        expect((service as any).isGzipBuffer(nonGzipBuffer)).toBe(false);
      });

      it('should return false for too-short buffers', () => {
        const shortBuffer = Buffer.from([0x1f]);
        expect((service as any).isGzipBuffer(shortBuffer)).toBe(false);
      });
    });

    describe('decompressGzipToString', () => {
      it('should decompress gzipped content', () => {
        const originalText = 'Hello, DMARC World!';
        const gzipped = zlib.gzipSync(Buffer.from(originalText));

        const result = (service as any).decompressGzipToString(gzipped);

        expect(result).toBe(originalText);
      });

      it('should handle inflate as fallback', () => {
        const originalText = 'Inflated content';
        const deflated = zlib.deflateSync(Buffer.from(originalText));

        const result = (service as any).decompressGzipToString(deflated);

        expect(result).toBe(originalText);
      });
    });

    describe('coerceToArray', () => {
      it('should return array as-is', () => {
        const arr = [1, 2, 3];
        expect((service as any).coerceToArray(arr)).toEqual(arr);
      });

      it('should wrap single value in array', () => {
        expect((service as any).coerceToArray('single')).toEqual(['single']);
        expect((service as any).coerceToArray(42)).toEqual([42]);
      });

      it('should return empty array for undefined/null', () => {
        expect((service as any).coerceToArray(undefined)).toEqual([]);
        expect((service as any).coerceToArray(null)).toEqual([]);
      });
    });
  });
});
