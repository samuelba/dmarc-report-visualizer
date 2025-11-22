import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { XMLParser, X2jOptions } from 'fast-xml-parser';
import * as zlib from 'zlib';
const AdmZip = require('adm-zip');
import * as unzipper from 'unzipper';
import { DmarcReport } from '../entities/dmarc-report.entity';
import { DmarcRecord } from '../entities/dmarc-record.entity';
import { DkimResult } from '../entities/dkim-result.entity';
import { SpfResult } from '../entities/spf-result.entity';
import { PolicyOverrideReason } from '../entities/policy-override-reason.entity';
import { GeolocationService } from './geolocation.service';
import { ForwardingDetectionService } from './forwarding-detection.service';
import { IpLookupQueueService } from './ip-lookup-queue.service';

@Injectable()
export class DmarcParserService {
  private readonly logger = new Logger(DmarcParserService.name);
  private useAsyncIpLookup = true; // Toggle between sync and async IP lookup

  constructor(
    private geolocationService: GeolocationService,
    private forwardingDetectionService: ForwardingDetectionService,
    private ipLookupQueueService: IpLookupQueueService,
  ) {}

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
        sourceIp: typeof row.source_ip === 'string' ? row.source_ip : undefined,
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

    const entityLike: Partial<DmarcReport> = {
      reportId: reportMetadata?.report_id || reportMetadata?.reportId,
      orgName: reportMetadata?.org_name || reportMetadata?.orgName,
      email: reportMetadata?.email,
      domain: policyPublished?.domain,
      policy: policyPublished,
      records: parsedRecords as DmarcRecord[],
      beginDate: beginEpoch ? new Date(beginEpoch * 1000) : undefined,
      endDate: endEpoch ? new Date(endEpoch * 1000) : undefined,
      originalXml: xmlContent,
    };

    return entityLike;
  }

  /**
   * Unzip and extract DMARC report from various compressed formats
   * @param fileBuffer The file buffer to process
   * @param fileType The file type/extension (e.g., 'zip', 'gz', 'xml')
   * @returns The extracted XML content as a string
   */
  async unzipReport(fileBuffer: Buffer, fileType: string): Promise<string> {
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new BadRequestException('Invalid file buffer');
    }

    const type = (fileType || '').toLowerCase();
    this.logger.debug(
      `Processing file: type=${type}, size=${fileBuffer.length} bytes`,
    );

    // Direct text/XML
    if (type === 'xml' || type === 'txt') {
      return fileBuffer.toString('utf8');
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

    if (typeIsGzip) {
      try {
        return this.decompressGzipToString(fileBuffer);
      } catch (_e) {
        throw new BadRequestException('Failed to decompress gzip file');
      }
    }

    if (typeIsZip) {
      this.logger.debug('Processing as ZIP file');
      // Try AdmZip first
      try {
        this.logger.debug('Attempting AdmZip extraction');
        const zip = new AdmZip(fileBuffer);
        const entries = zip.getEntries().filter((e) => !e.isDirectory);
        this.logger.debug(`AdmZip found ${entries.length} entries`);
        if (entries.length === 0) {
          throw new BadRequestException('ZIP archive is empty');
        }
        // Prefer .xml files
        const xmlEntry = entries.find((e) =>
          e.entryName.toLowerCase().endsWith('.xml'),
        );
        if (xmlEntry) {
          this.logger.debug(`Found XML entry: ${xmlEntry.entryName}`);
          const data: Buffer = xmlEntry.getData() as Buffer;
          const result = data.toString('utf8');
          this.logger.debug(
            `AdmZip extraction successful: ${result.length} characters`,
          );
          return result;
        }
        // Next, look for .xml.gz or any .gz and gunzip
        const gzEntry = entries.find(
          (e) =>
            e.entryName.toLowerCase().endsWith('.xml.gz') ||
            e.entryName.toLowerCase().endsWith('.gz'),
        );
        if (gzEntry) {
          this.logger.debug(`Found GZ entry: ${gzEntry.entryName}`);
          const data: Buffer = gzEntry.getData() as Buffer;
          const result = this.decompressGzipToString(data);
          this.logger.debug(
            `AdmZip GZ extraction successful: ${result.length} characters`,
          );
          return result;
        }
        // Fallback to first file as text
        this.logger.debug(
          `Using first entry as fallback: ${entries[0].entryName}`,
        );
        const data: Buffer = entries[0].getData() as Buffer;
        const result = data.toString('utf8');
        this.logger.debug(
          `AdmZip fallback extraction successful: ${result.length} characters`,
        );
        return result;
      } catch (admZipError) {
        // Log the AdmZip error for debugging
        const admZipMsg =
          admZipError instanceof Error
            ? admZipError.message
            : String(admZipError);
        this.logger.warn(`AdmZip failed for file: ${admZipMsg}`);
        this.logger.debug(
          `AdmZip error stack: ${
            admZipError instanceof Error && admZipError.stack
              ? admZipError.stack
              : 'no-stack'
          }`,
        );

        // Only fallback to unzipper for specific ZIP format errors
        // For other errors (like data extraction issues), re-throw immediately
        const isZipFormatError =
          admZipError instanceof Error &&
          (admZipError.message.includes('Invalid or unsupported zip format') ||
            admZipError.message.includes('Invalid CEN header') ||
            admZipError.message.includes('Invalid LOC header') ||
            admZipError.message.includes('bad signature') ||
            admZipError.message.includes('Invalid zip file'));

        if (!isZipFormatError) {
          // This is likely a data processing error, not a ZIP format issue
          // Re-throw as the original error since AdmZip could read the ZIP
          throw new BadRequestException(
            `ZIP processing failed: ${admZipError.message}`,
          );
        }

        this.logger.debug(
          'AdmZip failed with ZIP format error, trying unzipper fallback',
        );
      }

      this.logger.debug('Attempting unzipper extraction as fallback');
      try {
        const archive = await unzipper.Open.buffer(fileBuffer);
        const files = archive.files.filter(
          (f) =>
            !f.path.endsWith('/') &&
            !f.type?.toLowerCase().includes('directory'),
        );
        this.logger.debug(`Unzipper found ${files.length} files`);
        if (files.length === 0) {
          throw new BadRequestException('ZIP archive is empty');
        }
        // Prefer .xml files
        const xmlFile = files.find((f) =>
          f.path.toLowerCase().endsWith('.xml'),
        );
        if (xmlFile) {
          this.logger.debug(`Found XML file: ${xmlFile.path}`);
          const xmlBuf: Buffer = (await xmlFile.buffer()) as Buffer;
          const result = xmlBuf.toString('utf8');
          this.logger.debug(
            `Unzipper extraction successful: ${result.length} characters`,
          );
          return result;
        }
        // Next, look for .xml.gz or any .gz
        const gzFile = files.find(
          (f) =>
            f.path.toLowerCase().endsWith('.xml.gz') ||
            f.path.toLowerCase().endsWith('.gz'),
        );
        if (gzFile) {
          this.logger.debug(`Found GZ file: ${gzFile.path}`);
          const gzBuf: Buffer = (await gzFile.buffer()) as Buffer;
          const result = this.decompressGzipToString(gzBuf);
          this.logger.debug(
            `Unzipper GZ extraction successful: ${result.length} characters`,
          );
          return result;
        }
        // Fallback: first file as text
        this.logger.debug(`Using first file as fallback: ${files[0].path}`);
        const xmlBuf: Buffer = (await files[0].buffer()) as Buffer;
        const result = xmlBuf.toString('utf8');
        this.logger.debug(
          `Unzipper fallback extraction successful: ${result.length} characters`,
        );
        return result;
      } catch (err: unknown) {
        this.logger.warn(
          `Unzipper failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.logger.debug(
          `Unzipper error stack: ${
            err instanceof Error && err.stack ? err.stack : 'no-stack'
          }`,
        );
        // As a last resort, if signature says gzip, attempt gzip again
        if (looksLikeGzip) {
          this.logger.debug('Attempting final GZIP fallback');
          try {
            const result = this.decompressGzipToString(fileBuffer);
            this.logger.debug(
              `GZIP fallback successful: ${result.length} characters`,
            );
            return result;
          } catch (gzipErr: unknown) {
            this.logger.debug(
              `GZIP fallback failed: ${
                gzipErr instanceof Error ? gzipErr.message : String(gzipErr)
              }`,
            );
          }
        }
        throw new BadRequestException('Failed to read ZIP archive');
      }
    }

    // Unknown: last attempt using signatures
    if (looksLikeGzip) {
      try {
        return this.decompressGzipToString(fileBuffer);
      } catch (_e) {
        throw new BadRequestException('Failed to decompress gzip file');
      }
    }
    if (looksLikeZip) {
      try {
        const archive = await unzipper.Open.buffer(fileBuffer);
        const files = archive.files.filter(
          (f) =>
            !f.path.endsWith('/') &&
            !f.type?.toLowerCase().includes('directory'),
        );
        if (files.length === 0) {
          throw new BadRequestException('ZIP archive is empty');
        }
        const xmlFile =
          files.find((f) => f.path.toLowerCase().endsWith('.xml')) || files[0];
        const xmlBuf = await xmlFile.buffer();
        return xmlBuf.toString('utf8');
      } catch (_e) {
        throw new BadRequestException('Failed to read ZIP archive');
      }
    }

    throw new BadRequestException(`Unsupported file type: ${fileType}`);
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
   * Decompress a GZIP buffer to a string
   */
  private decompressGzipToString(buffer: Buffer): string {
    try {
      const decompressed = zlib.gunzipSync(buffer);
      return decompressed.toString('utf8');
    } catch (_err) {
      const inflated = zlib.inflateSync(buffer);
      return inflated.toString('utf8');
    }
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
