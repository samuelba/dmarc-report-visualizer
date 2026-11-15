import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createReportUploadOptions,
  DEFAULT_REPORT_LIMITS,
  getReportLimits,
  ReportTooLargeError,
} from './report-limits.config';

const configWith = (values: Record<string, string | number | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('getReportLimits', () => {
  it('should return the defaults when nothing is configured', () => {
    expect(getReportLimits(configWith({}))).toEqual(DEFAULT_REPORT_LIMITS);
  });

  it('should read positive integers from the environment', () => {
    const limits = getReportLimits(
      configWith({
        REPORT_MAX_FILE_BYTES: '2048',
        REPORT_MAX_UNCOMPRESSED_BYTES: 4096,
        REPORT_MAX_ZIP_ENTRIES: '3',
        REPORT_MAX_RECORDS: '100',
        REPORT_MAX_MESSAGE_BYTES: '8192',
        REPORT_FAILURE_ARCHIVE_MAX_FILES: '7',
      }),
    );

    expect(limits).toEqual({
      maxFileBytes: 2048,
      maxUncompressedBytes: 4096,
      maxZipEntries: 3,
      maxRecords: 100,
      maxMessageBytes: 8192,
      maxFailureArchiveFiles: 7,
    });
  });

  it.each(['0', '-5', '1.5', 'abc', '  '])(
    'should fall back to the default for invalid value %p',
    (value) => {
      const limits = getReportLimits(configWith({ REPORT_MAX_RECORDS: value }));

      expect(limits.maxRecords).toBe(DEFAULT_REPORT_LIMITS.maxRecords);
    },
  );

  it('should return a frozen object', () => {
    expect(Object.isFrozen(getReportLimits(configWith({})))).toBe(true);
  });
});

describe('ReportTooLargeError', () => {
  it('should map to HTTP 413', () => {
    const error = new ReportTooLargeError('too big');

    expect(error.getStatus()).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(error.message).toBe('too big');
  });
});

describe('createReportUploadOptions', () => {
  it('should cap uploads at one file of REPORT_MAX_FILE_BYTES', () => {
    expect(
      createReportUploadOptions(configWith({ REPORT_MAX_FILE_BYTES: '1234' })),
    ).toEqual({ limits: { fileSize: 1234, files: 1 } });
  });
});
