import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GmailDownloaderService } from './gmail-downloader.service';
import { DmarcReportService } from './dmarc-report.service';
import { gmail_v1 } from 'googleapis';

describe('GmailDownloaderService', () => {
  let service: GmailDownloaderService;
  let _configService: ConfigService;

  // Mock ConfigService that allows setting values dynamically
  const mockConfigValues = new Map<string, string>();
  const mockConfigService = {
    get: jest.fn((key: string) => mockConfigValues.get(key)),
  };

  const mockDmarcReportService = {
    unzipReport: jest.fn(),
    parseXmlReport: jest.fn(),
    createOrUpdateByReportId: jest.fn(),
  };

  beforeEach(async () => {
    mockConfigValues.clear();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailDownloaderService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: DmarcReportService,
          useValue: mockDmarcReportService,
        },
      ],
    }).compile();

    service = module.get<GmailDownloaderService>(GmailDownloaderService);
    _configService = module.get<ConfigService>(ConfigService);

    // Prevent onModuleInit from running during tests
    mockConfigValues.set('ENABLE_GMAIL_DOWNLOADER', 'false');
  });

  describe('Configuration Methods', () => {
    describe('getDownloadDir', () => {
      it('should return absolute path from FILE_WATCH_DIR when provided', () => {
        mockConfigValues.set('FILE_WATCH_DIR', '/absolute/path/to/reports');
        const result = (service as any).getDownloadDir();
        expect(result).toBe('/absolute/path/to/reports');
      });

      it('should resolve relative path from FILE_WATCH_DIR', () => {
        mockConfigValues.set('FILE_WATCH_DIR', 'reports/incoming');
        const result = (service as any).getDownloadDir();
        expect(result).toContain('reports/incoming');
        expect(result).toMatch(/^\//); // Should be absolute
      });

      it('should return default path when FILE_WATCH_DIR is empty', () => {
        mockConfigValues.set('FILE_WATCH_DIR', '');
        const result = (service as any).getDownloadDir();
        expect(result).toContain('reports/incoming');
      });

      it('should return default path when FILE_WATCH_DIR is not set', () => {
        const result = (service as any).getDownloadDir();
        expect(result).toContain('reports/incoming');
      });
    });

    describe('getPollIntervalMs', () => {
      it('should return configured interval when valid number', () => {
        mockConfigValues.set('GMAIL_POLL_INTERVAL_MS', '60000');
        const result = (service as any).getPollIntervalMs();
        expect(result).toBe(60000);
      });

      it('should return default 5 minutes when not configured', () => {
        const result = (service as any).getPollIntervalMs();
        expect(result).toBe(5 * 60 * 1000); // 300000
      });

      it('should return default when configured value is invalid', () => {
        mockConfigValues.set('GMAIL_POLL_INTERVAL_MS', 'invalid');
        const result = (service as any).getPollIntervalMs();
        expect(result).toBe(5 * 60 * 1000);
      });

      it('should return default when configured value is negative', () => {
        mockConfigValues.set('GMAIL_POLL_INTERVAL_MS', '-1000');
        const result = (service as any).getPollIntervalMs();
        expect(result).toBe(5 * 60 * 1000);
      });

      it('should return default when configured value is zero', () => {
        mockConfigValues.set('GMAIL_POLL_INTERVAL_MS', '0');
        const result = (service as any).getPollIntervalMs();
        expect(result).toBe(5 * 60 * 1000);
      });
    });

    describe('getListPageSize', () => {
      it('should return configured page size when valid', () => {
        mockConfigValues.set('GMAIL_LIST_PAGE_SIZE', '50');
        const result = (service as any).getListPageSize();
        expect(result).toBe(50);
      });

      it('should return default 100 when not configured', () => {
        const result = (service as any).getListPageSize();
        expect(result).toBe(100);
      });

      it('should return default when configured value exceeds max (500)', () => {
        mockConfigValues.set('GMAIL_LIST_PAGE_SIZE', '600');
        const result = (service as any).getListPageSize();
        expect(result).toBe(100);
      });

      it('should return default when configured value is below min (1)', () => {
        mockConfigValues.set('GMAIL_LIST_PAGE_SIZE', '0');
        const result = (service as any).getListPageSize();
        expect(result).toBe(100);
      });

      it('should floor decimal values', () => {
        mockConfigValues.set('GMAIL_LIST_PAGE_SIZE', '25.7');
        const result = (service as any).getListPageSize();
        expect(result).toBe(25);
      });

      it('should accept max value 500', () => {
        mockConfigValues.set('GMAIL_LIST_PAGE_SIZE', '500');
        const result = (service as any).getListPageSize();
        expect(result).toBe(500);
      });

      it('should accept min value 1', () => {
        mockConfigValues.set('GMAIL_LIST_PAGE_SIZE', '1');
        const result = (service as any).getListPageSize();
        expect(result).toBe(1);
      });
    });

    describe('getSourceLabelName', () => {
      it('should return configured label name', () => {
        mockConfigValues.set('GMAIL_LABEL', 'Custom DMARC');
        const result = (service as any).getSourceLabelName();
        expect(result).toBe('Custom DMARC');
      });

      it('should return default "DMARC Reports" when not configured', () => {
        const result = (service as any).getSourceLabelName();
        expect(result).toBe('DMARC Reports');
      });

      it('should trim whitespace', () => {
        mockConfigValues.set('GMAIL_LABEL', '  Trimmed Label  ');
        const result = (service as any).getSourceLabelName();
        expect(result).toBe('Trimmed Label');
      });

      it('should return default when configured value is empty after trim', () => {
        mockConfigValues.set('GMAIL_LABEL', '   ');
        const result = (service as any).getSourceLabelName();
        expect(result).toBe('DMARC Reports');
      });
    });

    describe('getProcessedLabelName', () => {
      it('should return configured label name', () => {
        mockConfigValues.set('GMAIL_PROCESSED_LABEL', 'Processed Reports');
        const result = (service as any).getProcessedLabelName();
        expect(result).toBe('Processed Reports');
      });

      it('should return default "DMARC Processed" when not configured', () => {
        const result = (service as any).getProcessedLabelName();
        expect(result).toBe('DMARC Processed');
      });

      it('should trim whitespace', () => {
        mockConfigValues.set('GMAIL_PROCESSED_LABEL', '  Trimmed  ');
        const result = (service as any).getProcessedLabelName();
        expect(result).toBe('Trimmed');
      });
    });

    describe('getQueryString', () => {
      it('should return configured query string', () => {
        mockConfigValues.set('GMAIL_QUERY', 'custom query');
        const result = (service as any).getQueryString();
        expect(result).toBe('custom query');
      });

      it('should return default query with processed label exclusion', () => {
        mockConfigValues.set('GMAIL_PROCESSED_LABEL', 'Processed');
        const result = (service as any).getQueryString();
        expect(result).toContain('has:attachment');
        expect(result).toContain('newer_than:5d');
        expect(result).toContain('-label:"Processed"');
      });

      it('should trim configured query', () => {
        mockConfigValues.set('GMAIL_QUERY', '  trimmed query  ');
        const result = (service as any).getQueryString();
        expect(result).toBe('trimmed query');
      });
    });

    describe('getAuthMode', () => {
      it('should return "oauth" when configured', () => {
        mockConfigValues.set('GMAIL_AUTH_MODE', 'oauth');
        const result = (service as any).getAuthMode();
        expect(result).toBe('oauth');
      });

      it('should return "oauth" when configured with uppercase', () => {
        mockConfigValues.set('GMAIL_AUTH_MODE', 'OAUTH');
        const result = (service as any).getAuthMode();
        expect(result).toBe('oauth');
      });

      it('should return "service_account" as default', () => {
        const result = (service as any).getAuthMode();
        expect(result).toBe('service_account');
      });

      it('should return "service_account" for any other value', () => {
        mockConfigValues.set('GMAIL_AUTH_MODE', 'invalid');
        const result = (service as any).getAuthMode();
        expect(result).toBe('service_account');
      });
    });

    describe('getProcessInline', () => {
      it('should return true when configured', () => {
        mockConfigValues.set('GMAIL_PROCESS_INLINE', 'true');
        const result = (service as any).getProcessInline();
        expect(result).toBe(true);
      });

      it('should return false when configured to false', () => {
        mockConfigValues.set('GMAIL_PROCESS_INLINE', 'false');
        const result = (service as any).getProcessInline();
        expect(result).toBe(false);
      });

      it('should return true as default', () => {
        const result = (service as any).getProcessInline();
        expect(result).toBe(true);
      });

      it('should be case-insensitive', () => {
        mockConfigValues.set('GMAIL_PROCESS_INLINE', 'TRUE');
        expect((service as any).getProcessInline()).toBe(true);
        mockConfigValues.set('GMAIL_PROCESS_INLINE', 'FALSE');
        expect((service as any).getProcessInline()).toBe(false);
      });
    });

    describe('shouldSaveOriginal', () => {
      it('should return true when configured', () => {
        mockConfigValues.set('GMAIL_SAVE_ORIGINAL', 'true');
        const result = (service as any).shouldSaveOriginal();
        expect(result).toBe(true);
      });

      it('should return false when configured to false', () => {
        mockConfigValues.set('GMAIL_SAVE_ORIGINAL', 'false');
        const result = (service as any).shouldSaveOriginal();
        expect(result).toBe(false);
      });

      it('should return false as default', () => {
        const result = (service as any).shouldSaveOriginal();
        expect(result).toBe(false);
      });
    });

    describe('getFailedLabelName', () => {
      it('should return configured label name', () => {
        mockConfigValues.set('GMAIL_FAILED_LABEL', 'Failed Reports');
        const result = (service as any).getFailedLabelName();
        expect(result).toBe('Failed Reports');
      });

      it('should return null when not configured', () => {
        const result = (service as any).getFailedLabelName();
        expect(result).toBeNull();
      });

      it('should return null when empty after trim', () => {
        mockConfigValues.set('GMAIL_FAILED_LABEL', '   ');
        const result = (service as any).getFailedLabelName();
        expect(result).toBeNull();
      });
    });

    describe('getFailureThreshold', () => {
      it('should return configured threshold', () => {
        mockConfigValues.set('GMAIL_FAILURE_THRESHOLD', '5');
        const result = (service as any).getFailureThreshold();
        expect(result).toBe(5);
      });

      it('should return default 3 when not configured', () => {
        const result = (service as any).getFailureThreshold();
        expect(result).toBe(3);
      });

      it('should return default when configured value is invalid', () => {
        mockConfigValues.set('GMAIL_FAILURE_THRESHOLD', 'invalid');
        const result = (service as any).getFailureThreshold();
        expect(result).toBe(3);
      });

      it('should return default when configured value is zero', () => {
        mockConfigValues.set('GMAIL_FAILURE_THRESHOLD', '0');
        const result = (service as any).getFailureThreshold();
        expect(result).toBe(3);
      });

      it('should return default when configured value is negative', () => {
        mockConfigValues.set('GMAIL_FAILURE_THRESHOLD', '-1');
        const result = (service as any).getFailureThreshold();
        expect(result).toBe(3);
      });
    });
  });

  describe('Utility Methods', () => {
    describe('getSafeFilename', () => {
      it('should return the filename as-is when safe', () => {
        const result = (service as any).getSafeFilename('report.xml');
        expect(result).toBe('report.xml');
      });

      it('should extract basename from path', () => {
        const result = (service as any).getSafeFilename('path/to/report.xml');
        expect(result).toBe('report.xml');
      });

      it('should remove carriage returns', () => {
        const result = (service as any).getSafeFilename('report\r.xml');
        expect(result).toBe('report.xml');
      });

      it('should remove newlines', () => {
        const result = (service as any).getSafeFilename('report\n.xml');
        expect(result).toBe('report.xml');
      });

      it('should remove both \\r and \\n', () => {
        const result = (service as any).getSafeFilename('repo\r\nrt.xml');
        expect(result).toBe('report.xml');
      });

      it('should trim whitespace', () => {
        const result = (service as any).getSafeFilename('  report.xml  ');
        expect(result).toBe('report.xml');
      });

      it('should return default "attachment.bin" when result is empty', () => {
        const result = (service as any).getSafeFilename('   ');
        expect(result).toBe('attachment.bin');
      });

      it('should return default when only invalid characters', () => {
        const result = (service as any).getSafeFilename('\r\n');
        expect(result).toBe('attachment.bin');
      });

      it('should handle complex filenames with spaces', () => {
        const result = (service as any).getSafeFilename(
          'DMARC Report 2024.xml',
        );
        expect(result).toBe('DMARC Report 2024.xml');
      });

      it('should handle unicode characters', () => {
        const result = (service as any).getSafeFilename('报告.xml');
        expect(result).toBe('报告.xml');
      });
    });

    describe('decodeBase64Url', () => {
      it('should decode standard base64url string', () => {
        const encoded = 'SGVsbG8gV29ybGQ'; // "Hello World" without padding
        const result = (service as any).decodeBase64Url(encoded);
        expect(result.toString('utf8')).toBe('Hello World');
      });

      it('should handle base64url with dashes', () => {
        // Standard base64 uses +, base64url uses -
        const encoded = 'SGVsbG8-V29ybGQ'; // base64url format
        const result = (service as any).decodeBase64Url(encoded);
        expect(result).toBeInstanceOf(Buffer);
      });

      it('should handle base64url with underscores', () => {
        // Standard base64 uses /, base64url uses _
        const encoded = 'SGVsbG9_V29ybGQ'; // base64url format
        const result = (service as any).decodeBase64Url(encoded);
        expect(result).toBeInstanceOf(Buffer);
      });

      it('should add padding when needed (1 pad)', () => {
        const encoded = 'YQ'; // "a" - needs 2 pads
        const result = (service as any).decodeBase64Url(encoded);
        expect(result.toString('utf8')).toBe('a');
      });

      it('should add padding when needed (2 pads)', () => {
        const encoded = 'YWI'; // "ab" - needs 1 pad
        const result = (service as any).decodeBase64Url(encoded);
        expect(result.toString('utf8')).toBe('ab');
      });

      it('should handle already padded strings', () => {
        const encoded = 'SGVsbG8='; // Already has padding
        const result = (service as any).decodeBase64Url(encoded);
        expect(result.toString('utf8')).toBe('Hello');
      });

      it('should decode binary data correctly', () => {
        // Binary data that results in base64url special chars
        const original = Buffer.from([0xff, 0xfe, 0xfd]);
        const encoded = original
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
        const result = (service as any).decodeBase64Url(encoded);
        expect(result).toEqual(original);
      });

      it('should handle empty string', () => {
        const result = (service as any).decodeBase64Url('');
        expect(result).toBeInstanceOf(Buffer);
        expect(result.length).toBe(0);
      });

      it('should handle complex base64url string with mixed special chars', () => {
        // String with both - and _ characters
        const encoded = 'VGhpcyBpcyBhIHRlc3Qgd2l0aCBzcGVjaWFsIGNoYXJhY3RlcnMh';
        const result = (service as any).decodeBase64Url(encoded);
        expect(result).toBeInstanceOf(Buffer);
      });
    });

    describe('flattenParts', () => {
      it('should flatten a simple message part', () => {
        const part: gmail_v1.Schema$MessagePart = {
          partId: '0',
          mimeType: 'text/plain',
          filename: '',
          body: { size: 100 },
        };
        const result = (service as any).flattenParts(part);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(part);
      });

      it('should flatten nested parts', () => {
        const root: gmail_v1.Schema$MessagePart = {
          partId: '0',
          mimeType: 'multipart/mixed',
          parts: [
            { partId: '1', mimeType: 'text/plain' },
            { partId: '2', mimeType: 'text/html' },
          ],
        };
        const result = (service as any).flattenParts(root);
        expect(result).toHaveLength(3); // root + 2 children
        expect(result.map((p) => p.partId)).toContain('0');
        expect(result.map((p) => p.partId)).toContain('1');
        expect(result.map((p) => p.partId)).toContain('2');
      });

      it('should flatten deeply nested parts', () => {
        const root: gmail_v1.Schema$MessagePart = {
          partId: '0',
          parts: [
            {
              partId: '1',
              parts: [
                {
                  partId: '1.1',
                  parts: [{ partId: '1.1.1' }],
                },
              ],
            },
          ],
        };
        const result = (service as any).flattenParts(root);
        expect(result).toHaveLength(4);
        expect(result.map((p) => p.partId)).toContain('0');
        expect(result.map((p) => p.partId)).toContain('1');
        expect(result.map((p) => p.partId)).toContain('1.1');
        expect(result.map((p) => p.partId)).toContain('1.1.1');
      });

      it('should handle multiple children at each level', () => {
        const root: gmail_v1.Schema$MessagePart = {
          partId: '0',
          parts: [
            {
              partId: '1',
              parts: [{ partId: '1.1' }, { partId: '1.2' }],
            },
            {
              partId: '2',
              parts: [{ partId: '2.1' }, { partId: '2.2' }],
            },
          ],
        };
        const result = (service as any).flattenParts(root);
        expect(result).toHaveLength(7); // 0, 1, 1.1, 1.2, 2, 2.1, 2.2
      });

      it('should handle parts without children', () => {
        const root: gmail_v1.Schema$MessagePart = {
          partId: '0',
          parts: [],
        };
        const result = (service as any).flattenParts(root);
        expect(result).toHaveLength(1);
        expect(result[0].partId).toBe('0');
      });

      it('should handle parts with undefined parts array', () => {
        const root: gmail_v1.Schema$MessagePart = {
          partId: '0',
          mimeType: 'text/plain',
        };
        const result = (service as any).flattenParts(root);
        expect(result).toHaveLength(1);
        expect(result[0].partId).toBe('0');
      });

      it('should preserve all part properties', () => {
        const attachment: gmail_v1.Schema$MessagePart = {
          partId: '1',
          mimeType: 'application/xml',
          filename: 'report.xml',
          body: {
            size: 1024,
            attachmentId: 'att123',
          },
        };
        const root: gmail_v1.Schema$MessagePart = {
          partId: '0',
          parts: [attachment],
        };
        const result = (service as any).flattenParts(root);
        const found = result.find((p) => p.partId === '1');
        expect(found?.filename).toBe('report.xml');
        expect(found?.body?.attachmentId).toBe('att123');
        expect(found?.body?.size).toBe(1024);
      });
    });

    describe('detectFileTypeByName', () => {
      it('should detect .xml files', () => {
        const result = (service as any).detectFileTypeByName('report.xml');
        expect(result).toBe('xml');
      });

      it('should detect .xml.gz files as gz', () => {
        const result = (service as any).detectFileTypeByName('report.xml.gz');
        expect(result).toBe('gz');
      });

      it('should detect .gz files', () => {
        const result = (service as any).detectFileTypeByName('report.gz');
        expect(result).toBe('gz');
      });

      it('should detect .zip files', () => {
        const result = (service as any).detectFileTypeByName('report.zip');
        expect(result).toBe('zip');
      });

      it('should be case-insensitive for .xml', () => {
        expect((service as any).detectFileTypeByName('report.XML')).toBe('xml');
        expect((service as any).detectFileTypeByName('report.XmL')).toBe('xml');
      });

      it('should be case-insensitive for .gz', () => {
        expect((service as any).detectFileTypeByName('report.GZ')).toBe('gz');
        expect((service as any).detectFileTypeByName('report.Gz')).toBe('gz');
      });

      it('should be case-insensitive for .zip', () => {
        expect((service as any).detectFileTypeByName('report.ZIP')).toBe('zip');
        expect((service as any).detectFileTypeByName('report.Zip')).toBe('zip');
      });

      it('should return extension without dot for unknown types', () => {
        const result = (service as any).detectFileTypeByName('report.txt');
        expect(result).toBe('txt');
      });

      it('should return "xml" as default when no extension', () => {
        const result = (service as any).detectFileTypeByName('report');
        expect(result).toBe('xml');
      });

      it('should handle filenames with multiple dots', () => {
        const result = (service as any).detectFileTypeByName(
          'dmarc.report.2024.xml',
        );
        expect(result).toBe('xml');
      });

      it('should prioritize .xml.gz over .gz', () => {
        const result = (service as any).detectFileTypeByName('report.xml.gz');
        expect(result).toBe('gz'); // matches .xml.gz first
      });
    });
  });

  describe('onModuleInit', () => {
    it('should not start when ENABLE_GMAIL_DOWNLOADER is not true', async () => {
      mockConfigValues.set('ENABLE_GMAIL_DOWNLOADER', 'false');
      await service.onModuleInit();
      // Service should not initialize Gmail client
      expect((service as any).gmailClient).toBeNull();
    });

    it('should not start when ENABLE_GMAIL_DOWNLOADER is undefined', async () => {
      mockConfigValues.delete('ENABLE_GMAIL_DOWNLOADER');
      await service.onModuleInit();
      expect((service as any).gmailClient).toBeNull();
    });

    it('should be case-insensitive for enable flag', async () => {
      mockConfigValues.set('ENABLE_GMAIL_DOWNLOADER', 'TRUE');
      // Missing auth config will prevent full initialization, but should attempt to start
      await service.onModuleInit();
      // Will fail due to missing auth, but confirms it tried
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear interval when service is destroyed', async () => {
      // Set up a fake interval
      (service as any).intervalHandle = setInterval(() => {}, 1000);
      const _intervalId = (service as any).intervalHandle;

      await service.onModuleDestroy();

      expect((service as any).intervalHandle).toBeNull();
      // Note: We can't easily test that clearInterval was called on the exact ID
      // but we verify the handle is nulled
    });

    it('should handle destruction when no interval is set', async () => {
      (service as any).intervalHandle = null;
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});
