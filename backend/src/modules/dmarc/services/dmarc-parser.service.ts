import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { XMLParser, X2jOptions } from 'fast-xml-parser';
import * as zlib from 'zlib';
import { promisify } from 'util';
const AdmZip = require('adm-zip');
import * as unzipper from 'unzipper';
import { ConfigService } from '@nestjs/config';
import { DmarcReport } from '../entities/dmarc-report.entity';
import { DmarcRecord } from '../entities/dmarc-record.entity';
import { DkimResult } from '../entities/dkim-result.entity';
import { SpfResult } from '../entities/spf-result.entity';
import { PolicyOverrideReason } from '../entities/policy-override-reason.entity';
import { GeolocationService } from './geolocation.service';
import { ForwardingDetectionService } from './forwarding-detection.service';
import { IpLookupQueueService } from './ip-lookup-queue.service';
import {
  getReportLimits,
  ReportLimits,
  ReportTooLargeError,
} from '../config/report-limits.config';

const gunzipAsync = promisify(zlib.gunzip);
const inflateAsync = promisify(zlib.inflate);
const inflateRawAsync = promisify(zlib.inflateRaw);

interface AdmZipEntry {
  entryName: string;
  isDirectory: boolean;
  header: { encrypted: boolean; size: number; method: number };
  getCompressedData(): Buffer;
}

interface UnzipperFile {
  path: string;
  type?: string;
  uncompressedSize?: number;
  stream(): NodeJS.ReadableStream;
}

const ZIP_METHOD_STORED = 0;
const ZIP_METHOD_DEFLATED = 8;
const ZLIB_TOO_LARGE = 'ERR_BUFFER_TOO_LARGE';
const ZIP_FORMAT_ERROR_MARKERS = [
  'Invalid or unsupported zip format',
  'Invalid CEN header',
  'Invalid LOC header',
  'bad signature',
  'Invalid zip file',
];

@Injectable()
export class DmarcParserService {
  private readonly logger = new Logger(DmarcParserService.name);
  private useAsyncIpLookup = true; // Toggle between sync and async IP lookup
  private readonly limits: ReportLimits;

  constructor(
    private geolocationService: GeolocationService,
    private forwardingDetectionService: ForwardingDetectionService,
    private ipLookupQueueService: IpLookupQueueService,
    configService: ConfigService,
  ) {
    this.limits = getReportLimits(configService);
  }

  /**
   * Enable or disable async IP lookup (default: true)
   * When enabled: IPs are queued for background processing (non-blocking)
   * When disabled: IPs are looked up immediately (blocking)
   */
  setAsyncIpLookup(enabled: boolean): void {
    this.useAsyncIpLookup = enabled;
    this.logger.log(`Async IP lookup ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Parse XML DMARC report content into a structured DmarcReport object
   * @param xmlContent The XML content as a string
   * @returns Partial DmarcReport object with parsed data
   */
  async parseXmlReport(xmlContent: string): Promise<Partial<DmarcReport>> {
    if (!xmlContent || typeof xmlContent !== 'string') {
      throw new BadRequestException('Invalid XML content');
    }

    const options: Partial<X2jOptions> = {
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      trimValues: true,
      parseTagValue: true,
      parseAttributeValue: true,
      isArray: (
        tagName: string,
        _jPath: string,
        _isLeafNode: boolean,
        _isAttribute: boolean,
      ): boolean =>
        tagName === 'record' ||
        tagName === 'dkim' ||
        tagName === 'spf' ||
        tagName === 'reason',
    };
    const parser = new XMLParser(options);

    let parsed: any;
    try {
      parsed = parser.parse(xmlContent);
    } catch (_err) {
      throw new BadRequestException('Failed to parse XML content');
    }

    const root = parsed?.feedback || parsed?.report || parsed;

    const reportMetadata = root?.report_metadata || root?.reportMetadata || {};
    const policyPublished =
      root?.policy_published || root?.policyPublished || {};
    const recordsNode = root?.record || root?.records || [];

    const beginEpoch: number | undefined = Number(
      reportMetadata?.date_range?.begin ?? reportMetadata?.dateRange?.begin,
    );
    const endEpoch: number | undefined = Number(
      reportMetadata?.date_range?.end ?? reportMetadata?.dateRange?.end,
    );

    const recordsArray = this.coerceToArray<any>(recordsNode);

    // Parse records into normalized entities
    const parsedRecords: Partial<DmarcRecord>[] = [];

    for (const recordData of recordsArray) {
      if (!recordData || typeof recordData !== 'object') {
        continue;
      }

      const row = recordData.row || {};
      // Support both 'identifiers' and 'identities' (both are valid per DMARC spec)
      const identifiers = recordData.identifiers || recordData.identities || {};
      const authResults = recordData.auth_results || {};
      const policyEvaluated = row.policy_evaluated || {};

      const normalizePassFail = (v: unknown): 'pass' | 'fail' | undefined => {
        // Handle both string and array formats (some XML parsers return arrays)
        const value = Array.isArray(v) ? v[0] : v;
        if (typeof value !== 'string') {
          return undefined;
        }
        const val = value.toLowerCase();
        if (val === 'pass') {
          return 'pass';
        }
        if (val === 'fail') {
          return 'fail';
        }
        return undefined;
      };

      const normalizeDisposition = (
        v: unknown,
      ): 'none' | 'quarantine' | 'reject' | undefined => {
        if (typeof v !== 'string') {
          return undefined;
        }
        const val = v.toLowerCase();
        if (val === 'none' || val === 'quarantine' || val === 'reject') {
          return val;
        }
        return undefined;
      };

      // Parse policy override reasons first to get the primary reason
      const policyReasonArray = this.coerceToArray(
        policyEvaluated.reason || [],
      );
      const primaryReason =
        policyReasonArray.length > 0 ? policyReasonArray[0] : null;

      // Create the main record
      const dmarcRecord: Partial<DmarcRecord> = {
        sourceIp:
          typeof row.source_ip === 'string' && row.source_ip.trim() !== ''
            ? row.source_ip.trim()
            : undefined,
        count: row.count ? parseInt(String(row.count), 10) : undefined,
        disposition: normalizeDisposition(policyEvaluated.disposition),
        dmarcDkim: normalizePassFail(policyEvaluated.dkim),
        dmarcSpf: normalizePassFail(policyEvaluated.spf),
        envelopeTo:
          typeof identifiers.envelope_to === 'string'
            ? identifiers.envelope_to
            : undefined,
        envelopeFrom:
          typeof identifiers.envelope_from === 'string'
            ? identifiers.envelope_from
            : undefined,
        headerFrom:
          typeof identifiers.header_from === 'string'
            ? identifiers.header_from
            : undefined,
        reasonType:
          typeof primaryReason?.type === 'string'
            ? primaryReason.type
            : undefined,
        reasonComment:
          typeof primaryReason?.comment === 'string'
            ? primaryReason.comment
            : undefined,
      };

      // Parse DKIM results
      const dkimResults: Partial<DkimResult>[] = [];
      const dkimArray = this.coerceToArray(authResults.dkim || []);
      for (const dkim of dkimArray) {
        if (dkim && typeof dkim === 'object') {
          const dkimResultValue =
            typeof dkim.result === 'string'
              ? dkim.result.toLowerCase()
              : undefined;
          dkimResults.push({
            domain: dkim.domain,
            selector: dkim.selector,
            result: dkimResultValue,
            humanResult: dkim.human_result,
          });
        }
      }

      // Set dkimMissing flag - true if auth_results has no dkim entry
      (dmarcRecord as any).dkimMissing = dkimResults.length === 0;

      // Parse SPF results
      const spfResults: Partial<SpfResult>[] = [];
      const spfArray = this.coerceToArray(authResults.spf || []);
      for (const spf of spfArray) {
        if (spf && typeof spf === 'object') {
          const spfResultValue =
            typeof spf.result === 'string'
              ? spf.result.toLowerCase()
              : undefined;
          spfResults.push({
            domain: spf.domain,
            result: spfResultValue,
          });
        }
      }

      // Parse policy override reasons
      const policyOverrideReasons: Partial<PolicyOverrideReason>[] = [];
      const reasonArray = this.coerceToArray(policyEvaluated.reason || []);
      for (const reason of reasonArray) {
        if (reason && typeof reason === 'object') {
          policyOverrideReasons.push({
            type: reason.type,
            comment: reason.comment,
          });
        }
      }

      // Add the parsed child entities to the record
      (dmarcRecord as any).dkimResults = dkimResults;
      (dmarcRecord as any).spfResults = spfResults;
      (dmarcRecord as any).policyOverrideReasons = policyOverrideReasons;

      // Note: dmarcDkim and dmarcSpf should ONLY come from policy_evaluated, not auth_results
      // The policy_evaluated values represent DMARC alignment (domain alignment)
      // The auth_results values represent authentication success (which is different)
      // We intentionally do NOT fall back to auth_results here as that would be incorrect

      // Add geolocation data for the source IP
      if (dmarcRecord.sourceIp) {
        if (this.useAsyncIpLookup) {
          // Async mode: Just queue the IP, don't block parsing
          // Geo data will be filled in by background worker
          // Note: We'll queue after the record is saved (has an ID)
          this.logger.debug(
            `IP ${dmarcRecord.sourceIp} will be queued for async lookup`,
          );
        } else {
          // Sync mode: Lookup immediately (blocks parsing)
          try {
            const geoData = await this.geolocationService.getLocationForIp(
              dmarcRecord.sourceIp,
            );
            if (geoData) {
              dmarcRecord.geoCountry = geoData.country;
              dmarcRecord.geoCountryName = geoData.countryName;
              dmarcRecord.geoCity = geoData.city;
              dmarcRecord.geoLatitude = geoData.latitude;
              dmarcRecord.geoLongitude = geoData.longitude;
              dmarcRecord.geoIsp = geoData.isp;
              dmarcRecord.geoOrg = geoData.org;
            }
          } catch (error) {
            this.logger.warn(
              `Failed to get geolocation for IP ${dmarcRecord.sourceIp}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      // Detect if email was forwarded
      try {
        const forwardingResult =
          await this.forwardingDetectionService.detectForwarding(dmarcRecord);
        (dmarcRecord as any).isForwarded = forwardingResult.isForwarded;
        (dmarcRecord as any).forwardReason = forwardingResult.reason;
        // Mark as reprocessed since we just processed it successfully
        (dmarcRecord as any).reprocessed = true;
      } catch (error) {
        this.logger.warn(
          `Failed to detect forwarding for record: ${error instanceof Error ? error.message : String(error)}`,
        );
        (dmarcRecord as any).isForwarded = null;
        (dmarcRecord as any).forwardReason = null;
        // Mark as not reprocessed since detection failed
        (dmarcRecord as any).reprocessed = false;
      }

      parsedRecords.push(dmarcRecord);
    }

    // Filter out empty placeholder records that contain no meaningful data.
    // Some reporters (e.g. o2.pl) send reports with empty records when no
    // traffic was observed. These records have no source IP, a count of 0,
    // no header_from, and no auth results — storing them pollutes analytics
    // with "Unknown" entries.
    const meaningfulRecords = parsedRecords.filter(
      (r) => !this.isEmptyPlaceholderRecord(r),
    );
    if (meaningfulRecords.length < parsedRecords.length) {
      const skipped = parsedRecords.length - meaningfulRecords.length;
      this.logger.log(
        `Filtered out ${skipped} empty placeholder record(s) from report ${reportMetadata?.report_id || reportMetadata?.reportId || 'unknown'}`,
      );
    }

    const entityLike: Partial<DmarcReport> = {
      reportId: reportMetadata?.report_id || reportMetadata?.reportId,
      orgName: reportMetadata?.org_name || reportMetadata?.orgName,
      email: reportMetadata?.email,
      domain: policyPublished?.domain,
      policy: policyPublished,
      records: meaningfulRecords as DmarcRecord[],
      beginDate: beginEpoch ? new Date(beginEpoch * 1000) : undefined,
      endDate: endEpoch ? new Date(endEpoch * 1000) : undefined,
      originalXml: xmlContent,
    };

    return entityLike;
  }

  /**
   * Unzip and extract DMARC report from various compressed formats.
   * Every path is bounded by the configured report limits, so a small
   * compressed input cannot expand into an arbitrarily large buffer.
   * @param fileBuffer The file buffer to process
   * @param fileType The file type/extension (e.g., 'zip', 'gz', 'xml')
   * @returns The extracted XML content as a string
   */
  async unzipReport(fileBuffer: Buffer, fileType: string): Promise<string> {
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new BadRequestException('Invalid file buffer');
    }
    if (fileBuffer.length > this.limits.maxFileBytes) {
      throw new ReportTooLargeError(
        `Report file exceeds ${this.limits.maxFileBytes} bytes`,
      );
    }

    const type = (fileType || '').toLowerCase();
    this.logger.debug(
      `Processing file: type=${type}, size=${fileBuffer.length} bytes`,
    );

    if (type === 'xml' || type === 'txt') {
      return this.toXmlString(fileBuffer);
    }

    // Signature-based sniffing to fix mislabeled attachments
    const looksLikeZip = this.isZipBuffer(fileBuffer);
    const looksLikeGzip = this.isGzipBuffer(fileBuffer);

    const typeIsGzip =
      type === 'gz' ||
      type === 'gzip' ||
      ((!type || type === 'zip') && looksLikeGzip);
    const typeIsZip =
      type === 'zip' ||
      ((!type || type === 'gz' || type === 'gzip') && looksLikeZip);

    if (typeIsGzip || (!typeIsZip && looksLikeGzip)) {
      return this.toXmlString(await this.decompressGzipOrFail(fileBuffer));
    }

    if (typeIsZip) {
      return this.toXmlString(await this.extractZip(fileBuffer, looksLikeGzip));
    }

    if (looksLikeZip) {
      try {
        return this.toXmlString(await this.extractWithUnzipper(fileBuffer));
      } catch (err) {
        this.rethrowIfTooLarge(err);
        throw new BadRequestException('Failed to read ZIP archive');
      }
    }

    throw new BadRequestException(`Unsupported file type: ${fileType}`);
  }

  private async extractZip(
    fileBuffer: Buffer,
    looksLikeGzip: boolean,
  ): Promise<Buffer> {
    try {
      return await this.extractWithAdmZip(fileBuffer);
    } catch (admZipError) {
      this.rethrowIfTooLarge(admZipError);
      const message = this.errorMessage(admZipError);
      this.logger.warn(`AdmZip failed for file: ${message}`);
      // Only fall back to unzipper when AdmZip could not read the archive format
      if (!this.isZipFormatError(admZipError)) {
        throw new BadRequestException(`ZIP processing failed: ${message}`);
      }
    }

    try {
      return await this.extractWithUnzipper(fileBuffer);
    } catch (err) {
      this.rethrowIfTooLarge(err);
      this.logger.warn(`Unzipper failed: ${this.errorMessage(err)}`);
      if (looksLikeGzip) {
        try {
          return await this.gunzipLimited(fileBuffer);
        } catch (gzipErr) {
          this.rethrowIfTooLarge(gzipErr);
          this.logger.debug(
            `GZIP fallback failed: ${this.errorMessage(gzipErr)}`,
          );
        }
      }
      throw new BadRequestException('Failed to read ZIP archive');
    }
  }

  private async extractWithAdmZip(fileBuffer: Buffer): Promise<Buffer> {
    const zip = new AdmZip(fileBuffer);
    const entries: AdmZipEntry[] = zip
      .getEntries()
      .filter((e: AdmZipEntry) => !e.isDirectory);
    this.assertZipEntryCount(entries.length);

    const { item, gzipped } = this.pickReportEntry(entries, (e) => e.entryName);
    this.logger.debug(`AdmZip extracting entry: ${item.entryName}`);
    const data = await this.readAdmZipEntryLimited(item);
    return gzipped ? this.gunzipLimited(data) : data;
  }

  private async extractWithUnzipper(fileBuffer: Buffer): Promise<Buffer> {
    const archive = await unzipper.Open.buffer(fileBuffer);
    const files: UnzipperFile[] = archive.files.filter(
      (f) =>
        !f.path.endsWith('/') && !f.type?.toLowerCase().includes('directory'),
    );
    this.assertZipEntryCount(files.length);

    const { item, gzipped } = this.pickReportEntry(files, (f) => f.path);
    this.logger.debug(`Unzipper extracting entry: ${item.path}`);
    this.assertUncompressedSize(item.uncompressedSize);
    const data = await this.readUnzipperFileLimited(item);
    return gzipped ? this.gunzipLimited(data) : data;
  }

  /**
   * Prefer an .xml entry, then a gzipped entry, then the first entry.
   */
  private pickReportEntry<T>(
    entries: T[],
    nameOf: (entry: T) => string,
  ): { item: T; gzipped: boolean } {
    if (entries.length === 0) {
      throw new BadRequestException('ZIP archive is empty');
    }
    const lowerName = (entry: T) => nameOf(entry).toLowerCase();
    const xmlEntry = entries.find((e) => lowerName(e).endsWith('.xml'));
    if (xmlEntry) {
      return { item: xmlEntry, gzipped: false };
    }
    const gzEntry = entries.find((e) => lowerName(e).endsWith('.gz'));
    if (gzEntry) {
      return { item: gzEntry, gzipped: true };
    }
    return { item: entries[0], gzipped: false };
  }

  /**
   * Inflates an AdmZip entry from its raw compressed bytes with an output cap.
   * The declared size in the header is only a fast pre-check, since it is
   * attacker-controlled.
   */
  private async readAdmZipEntryLimited(entry: AdmZipEntry): Promise<Buffer> {
    if (entry.header.encrypted) {
      throw new BadRequestException('Encrypted ZIP entries are not supported');
    }
    this.assertUncompressedSize(entry.header.size);

    const compressed: Buffer = entry.getCompressedData();
    switch (entry.header.method) {
      case ZIP_METHOD_STORED:
        this.assertUncompressedSize(compressed.length);
        return compressed;
      case ZIP_METHOD_DEFLATED:
        return this.runLimited(inflateRawAsync, compressed);
      default:
        throw new BadRequestException(
          `Unsupported ZIP compression method: ${entry.header.method}`,
        );
    }
  }

  private async readUnzipperFileLimited(
    file: Pick<UnzipperFile, 'stream'>,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of file.stream()) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      this.assertUncompressedSize(total);
      chunks.push(buf);
    }
    return Buffer.concat(chunks);
  }

  private async decompressGzipOrFail(buffer: Buffer): Promise<Buffer> {
    try {
      return await this.gunzipLimited(buffer);
    } catch (err) {
      this.rethrowIfTooLarge(err);
      throw new BadRequestException('Failed to decompress gzip file');
    }
  }

  /**
   * Decompress a GZIP (or zlib) buffer without exceeding the output limit.
   */
  private async gunzipLimited(buffer: Buffer): Promise<Buffer> {
    try {
      return await this.runLimited(gunzipAsync, buffer);
    } catch (err) {
      this.rethrowIfTooLarge(err);
      return this.runLimited(inflateAsync, buffer);
    }
  }

  private async runLimited(
    decompress: (buf: Buffer, options: zlib.ZlibOptions) => Promise<Buffer>,
    buffer: Buffer,
  ): Promise<Buffer> {
    try {
      return await decompress(buffer, {
        maxOutputLength: this.limits.maxUncompressedBytes,
      });
    } catch (err) {
      if (
        err instanceof RangeError ||
        (err as NodeJS.ErrnoException)?.code === ZLIB_TOO_LARGE
      ) {
        throw this.tooLargeError();
      }
      throw err;
    }
  }

  private toXmlString(buffer: Buffer): string {
    this.assertUncompressedSize(buffer.length);
    return buffer.toString('utf8');
  }

  private assertUncompressedSize(size: number | undefined): void {
    if (typeof size === 'number' && size > this.limits.maxUncompressedBytes) {
      throw this.tooLargeError();
    }
  }

  private assertZipEntryCount(count: number): void {
    if (count > this.limits.maxZipEntries) {
      throw new ReportTooLargeError(
        `ZIP archive has ${count} entries (limit ${this.limits.maxZipEntries})`,
      );
    }
  }

  private tooLargeError(): ReportTooLargeError {
    return new ReportTooLargeError(
      `Decompressed report exceeds ${this.limits.maxUncompressedBytes} bytes`,
    );
  }

  private rethrowIfTooLarge(err: unknown): void {
    if (err instanceof ReportTooLargeError) {
      throw err;
    }
  }

  private isZipFormatError(err: unknown): boolean {
    if (!(err instanceof Error)) {
      return false;
    }
    return ZIP_FORMAT_ERROR_MARKERS.some((marker) =>
      err.message.includes(marker),
    );
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * Check if a buffer contains a ZIP file by examining its signature
   */
  private isZipBuffer(buffer: Buffer): boolean {
    if (buffer.length < 4) {
      return false;
    }
    const a = buffer[0] === 0x50 && buffer[1] === 0x4b; // 'PK'
    return a;
  }

  /**
   * Check if a buffer contains a GZIP file by examining its signature
   */
  private isGzipBuffer(buffer: Buffer): boolean {
    if (buffer.length < 2) {
      return false;
    }
    return buffer[0] === 0x1f && buffer[1] === 0x8b;
  }

  /**
   * Coerce a value to an array (helper for XML parsing)
   */
  private coerceToArray<T>(maybeArray: T | T[] | undefined): T[] {
    if (!maybeArray) {
      return [];
    }
    return Array.isArray(maybeArray) ? maybeArray : [maybeArray];
  }

  /**
   * Determine whether a parsed record is an empty placeholder that carries
   * no meaningful data. Some DMARC reporters send a single record with
   * count=0, empty source_ip, empty header_from and no auth results when
   * they observed zero traffic for the reporting period.
   */
  private isEmptyPlaceholderRecord(record: Partial<DmarcRecord>): boolean {
    const hasNoSourceIp = !record.sourceIp;
    const hasZeroOrNoCount = !record.count || record.count === 0;
    const hasNoHeaderFrom = !record.headerFrom;
    const hasNoDisposition = !record.disposition;
    const hasNoDmarcResults = !record.dmarcDkim && !record.dmarcSpf;
    const hasNoDkimResults =
      !record.dkimResults ||
      record.dkimResults.length === 0 ||
      record.dkimResults.every((r) => !r.domain && !r.result);
    const hasNoSpfResults =
      !record.spfResults ||
      record.spfResults.length === 0 ||
      record.spfResults.every((r) => !r.domain && !r.result);
    const hasNoEnvelopeTo = !record.envelopeTo;
    const hasNoEnvelopeFrom = !record.envelopeFrom;
    const hasNoReasonType = !record.reasonType;
    const hasNoReasonComment = !record.reasonComment;
    const hasNoPolicyOverrideReasons =
      !record.policyOverrideReasons ||
      record.policyOverrideReasons.length === 0 ||
      record.policyOverrideReasons.every((r) => !r.type && !r.comment);

    return (
      hasNoSourceIp &&
      hasZeroOrNoCount &&
      hasNoHeaderFrom &&
      hasNoDisposition &&
      hasNoDmarcResults &&
      hasNoDkimResults &&
      hasNoSpfResults &&
      hasNoEnvelopeTo &&
      hasNoEnvelopeFrom &&
      hasNoReasonType &&
      hasNoReasonComment &&
      hasNoPolicyOverrideReasons
    );
  }

  /**
   * Queue IP lookups for records that were parsed in async mode
   * Call this after records have been saved to the database
   * @param records - Array of saved DMARC records with IDs
   */
  queueIpLookupsForRecords(records: DmarcRecord[]): void {
    if (!this.useAsyncIpLookup) {
      return; // Not using async mode
    }

    // Group records by IP
    const ipMap = new Map<string, string[]>();

    for (const record of records) {
      if (!record.sourceIp || !record.id) {
        continue;
      }

      // Skip if already has geo data
      if (record.geoCountry) {
        continue;
      }

      if (!ipMap.has(record.sourceIp)) {
        ipMap.set(record.sourceIp, []);
      }
      ipMap.get(record.sourceIp)!.push(record.id);
    }

    if (ipMap.size === 0) {
      return;
    }

    // Queue all IPs
    const items = Array.from(ipMap.entries()).map(([ip, recordIds]) => ({
      ip,
      recordIds,
      priority: 0, // High priority for new records
    }));

    this.ipLookupQueueService.queueMultipleIps(items);

    this.logger.log(
      `Queued ${items.length} unique IPs for ${records.length} records`,
    );
  }
}
