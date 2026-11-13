import { Logger, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MIB = 1024 * 1024;

export interface ReportLimits {
  maxFileBytes: number;
  maxUncompressedBytes: number;
  maxZipEntries: number;
  maxRecords: number;
  maxMessageBytes: number;
  maxFailureArchiveFiles: number;
}

export const DEFAULT_REPORT_LIMITS: Readonly<ReportLimits> = Object.freeze({
  maxFileBytes: 10 * MIB,
  maxUncompressedBytes: 50 * MIB,
  maxZipEntries: 10,
  maxRecords: 50_000,
  maxMessageBytes: 25 * MIB,
  maxFailureArchiveFiles: 500,
});

const ENV_KEYS: Readonly<Record<keyof ReportLimits, string>> = {
  maxFileBytes: 'REPORT_MAX_FILE_BYTES',
  maxUncompressedBytes: 'REPORT_MAX_UNCOMPRESSED_BYTES',
  maxZipEntries: 'REPORT_MAX_ZIP_ENTRIES',
  maxRecords: 'REPORT_MAX_RECORDS',
  maxMessageBytes: 'REPORT_MAX_MESSAGE_BYTES',
  maxFailureArchiveFiles: 'REPORT_FAILURE_ARCHIVE_MAX_FILES',
};

const logger = new Logger('ReportLimits');

function readPositiveInt(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string | number>(key);
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    logger.warn(
      `Ignoring invalid ${key}=${String(raw)}; using default ${fallback}`,
    );
    return fallback;
  }
  return value;
}

export function getReportLimits(config: ConfigService): ReportLimits {
  const read = (name: keyof ReportLimits): number =>
    readPositiveInt(config, ENV_KEYS[name], DEFAULT_REPORT_LIMITS[name]);
  return Object.freeze({
    maxFileBytes: read('maxFileBytes'),
    maxUncompressedBytes: read('maxUncompressedBytes'),
    maxZipEntries: read('maxZipEntries'),
    maxRecords: read('maxRecords'),
    maxMessageBytes: read('maxMessageBytes'),
    maxFailureArchiveFiles: read('maxFailureArchiveFiles'),
  });
}

export class ReportTooLargeError extends PayloadTooLargeException {
  constructor(message: string) {
    super(message);
    this.name = 'ReportTooLargeError';
  }
}
