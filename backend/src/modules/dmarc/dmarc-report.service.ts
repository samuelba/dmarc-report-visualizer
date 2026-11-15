import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  Equal,
  FindOptionsSelect,
  FindOptionsWhere,
  ILike,
  IsNull,
  Not,
  EntityManager,
  Or,
  Repository,
} from 'typeorm';
import { DmarcReport } from './entities/dmarc-report.entity';
import { DmarcRecord } from './entities/dmarc-record.entity';
import { DmarcReportDelivery } from './entities/dmarc-report-delivery.entity';
import { DkimResult } from './entities/dkim-result.entity';
import { SpfResult } from './entities/spf-result.entity';
import { PolicyOverrideReason } from './entities/policy-override-reason.entity';
import { DmarcParserService } from './services/dmarc-parser.service';
import { hashReportXml } from './utils/report-content-hash';
import {
  decideCollision,
  DeliveryOutcome,
  ReportProvenance,
} from './utils/report-provenance';
import { DmarcAnalyticsService } from './services/dmarc-analytics.service';
import { DmarcGeoAnalyticsService } from './services/dmarc-geo-analytics.service';
import {
  DmarcSearchService,
  PagedResult,
} from './services/dmarc-search.service';

export { PagedResult };

const REPORT_RELATIONS = {
  records: {
    dkimResults: true,
    spfResults: true,
    policyOverrideReasons: true,
  },
};

const REPORT_LIST_SELECT: FindOptionsSelect<DmarcReport> = {
  id: true,
  reportId: true,
  orgName: true,
  email: true,
  domain: true,
  policy: true,
  contentHash: true,
  authStatus: true,
  authDomain: true,
  claimedDomain: true,
  beginDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
};

const RECORD_INSERT_CHUNK_SIZE = 500;

const MAX_DELIVERIES_LISTED = 50;

/** Bounds how much attacker-supplied XML is kept per report for review. */
const MAX_REJECTED_COPIES_PER_REPORT = 10;

export interface IngestResult {
  outcome: DeliveryOutcome | 'empty';
  report: DmarcReport | null;
}

type ReportVerdict = Pick<
  DmarcReport,
  'contentHash' | 'authStatus' | 'authDomain' | 'claimedDomain'
>;

@Injectable()
export class DmarcReportService {
  private readonly logger = new Logger(DmarcReportService.name);

  constructor(
    @InjectRepository(DmarcReport)
    private dmarcReportRepository: Repository<DmarcReport>,
    @InjectRepository(DmarcRecord)
    private dmarcRecordRepository: Repository<DmarcRecord>,
    @InjectRepository(DmarcReportDelivery)
    private deliveryRepository: Repository<DmarcReportDelivery>,
    @InjectRepository(DkimResult)
    private dkimResultRepository: Repository<DkimResult>,
    @InjectRepository(SpfResult)
    private spfResultRepository: Repository<SpfResult>,
    @InjectRepository(PolicyOverrideReason)
    private policyOverrideReasonRepository: Repository<PolicyOverrideReason>,
    private dmarcParserService: DmarcParserService,
    private dmarcAnalyticsService: DmarcAnalyticsService,
    private dmarcGeoAnalyticsService: DmarcGeoAnalyticsService,
    private dmarcSearchService: DmarcSearchService,
  ) {}

  // ========================================
  // CRUD Operations
  // ========================================

  async findAll(): Promise<DmarcReport[]> {
    return this.dmarcReportRepository.find({
      relations: REPORT_RELATIONS,
    });
  }

  async list(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
    sort?: 'beginDate' | 'endDate' | 'createdAt';
    order?: 'asc' | 'desc';
  }): Promise<PagedResult<DmarcReport>> {
    const {
      domain,
      from,
      to,
      page = 1,
      pageSize = 20,
      sort = 'beginDate',
      order = 'desc',
    } = params;

    const where: FindOptionsWhere<DmarcReport> = {};
    if (domain) {
      where.domain = ILike(`%${domain}%`);
    }
    if (from || to) {
      const lower = from ?? new Date(0);
      const upper = to ?? new Date('2999-12-31T23:59:59.999Z');
      where.beginDate = Between(lower, upper);
    }

    const [data, total] = await this.dmarcReportRepository.findAndCount({
      where,
      order: { [sort]: order.toUpperCase() as 'ASC' | 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: REPORT_LIST_SELECT,
    });

    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<DmarcReport | null> {
    return this.dmarcReportRepository.findOne({
      where: { id },
      relations: REPORT_RELATIONS,
    });
  }

  /** Newest first; the rejected XML is left out, it is sender-controlled. */
  async findDeliveries(reportId: string): Promise<DmarcReportDelivery[]> {
    return this.deliveryRepository.find({
      where: { reportId },
      order: { receivedAt: 'DESC' },
      take: MAX_DELIVERIES_LISTED,
      select: {
        id: true,
        reportId: true,
        source: true,
        sourceMessageId: true,
        receivedAt: true,
        contentHash: true,
        authStatus: true,
        authMethod: true,
        authDomain: true,
        claimedDomain: true,
        authDetails: true,
        outcome: true,
      },
    });
  }

  async findByReportId(
    reportId: string,
    loadRelations: boolean = true,
  ): Promise<DmarcReport | null> {
    return this.dmarcReportRepository.findOne({
      where: { reportId },
      relations: loadRelations ? REPORT_RELATIONS : undefined,
    });
  }

  /**
   * Find a report by its composite unique key (reportId + orgName + email)
   * This properly handles uniqueness across different reporting organizations
   *
   * The database unique constraint uses COALESCE(column, '') so NULL and ''
   * are identical for uniqueness. We mirror that here: when the caller passes
   * undefined or '' we issue `IS NULL OR = ''`, covering rows stored as either
   * value. A non-empty value is matched exactly.
   */
  async findByCompositeKey(
    reportId: string,
    orgName?: string,
    email?: string,
    loadRelations: boolean = true,
  ): Promise<DmarcReport | null> {
    // An absent / empty orgName or email means COALESCE yields '' in the index;
    // match both the NULL-stored and ''-stored variants so no legacy row is missed.
    const nullOrEmpty = Or(IsNull(), Equal(''));

    const where: FindOptionsWhere<DmarcReport> = {
      reportId,
      orgName: orgName ? orgName : nullOrEmpty,
      email: email ? email : nullOrEmpty,
    };

    return this.dmarcReportRepository.findOne({
      where,
      relations: loadRelations ? REPORT_RELATIONS : undefined,
    });
  }

  async create(dmarcReport: Partial<DmarcReport>): Promise<DmarcReport> {
    const { savedReport, savedRecords } =
      await this.dmarcReportRepository.manager.transaction((manager) =>
        this.insertReport(manager, { authStatus: 'manual', ...dmarcReport }),
      );

    this.queueIpLookups(savedRecords);

    // Return the saved report directly (we intentionally do not load relations to avoid OOM)
    return savedReport;
  }

  private async insertReport(
    manager: EntityManager,
    dmarcReport: Partial<DmarcReport>,
  ): Promise<{ savedReport: DmarcReport; savedRecords: DmarcRecord[] }> {
    const { records, ...reportData } = dmarcReport;
    const reportRepository = manager.getRepository(DmarcReport);
    const savedReport = await reportRepository.save(
      reportRepository.create(reportData),
    );
    return {
      savedReport,
      savedRecords: await this.insertRecords(manager, savedReport.id, records),
    };
  }

  /**
   * Inserts the records (and their cascaded DKIM/SPF/reason rows) in chunks
   * of multi-row INSERTs instead of one round trip per record.
   */
  private async insertRecords(
    manager: EntityManager,
    reportId: string,
    records: Partial<DmarcRecord>[] | undefined,
  ): Promise<DmarcRecord[]> {
    if (!records || records.length === 0) {
      return [];
    }
    const recordRepository = manager.getRepository(DmarcRecord);
    const entities = records.map((recordData) =>
      recordRepository.create({ ...recordData, reportId }),
    );
    return recordRepository.save(entities, { chunk: RECORD_INSERT_CHUNK_SIZE });
  }

  private queueIpLookups(savedRecords: DmarcRecord[]): void {
    if (savedRecords.length > 0) {
      this.dmarcParserService.queueIpLookupsForRecords(savedRecords);
    }
  }

  /**
   * Stores an incoming report. On a (reportId, orgName, email) collision the
   * stored data is only replaced by an aligned copy (see decideCollision); every copy
   * is recorded as a delivery.
   */
  async createOrUpdateByReportId(
    dmarcReport: Partial<DmarcReport>,
    provenance: ReportProvenance,
  ): Promise<IngestResult> {
    // Skip reports with no meaningful records (e.g. empty placeholder reports
    // from senders like o2.pl that had zero traffic to report).
    if (!dmarcReport.records || dmarcReport.records.length === 0) {
      this.logger.log(
        `Skipping empty report (reportId=${dmarcReport.reportId || 'n/a'}, org=${dmarcReport.orgName || 'n/a'}): no meaningful records`,
      );
      return { outcome: 'empty', report: null };
    }

    const verdict: ReportVerdict = {
      contentHash: hashReportXml(dmarcReport.originalXml),
      authStatus: provenance.authStatus,
      authDomain: provenance.authDomain ?? null,
      claimedDomain: provenance.claimedDomain ?? null,
    };

    // loadRelations = false avoids eager fetching thousands of records (OOM).
    const existing = dmarcReport.reportId
      ? await this.findByCompositeKey(
          dmarcReport.reportId,
          dmarcReport.orgName,
          dmarcReport.email,
          false,
        )
      : null;

    if (!existing) {
      return this.ingestNew(dmarcReport, verdict, provenance);
    }

    const outcome = decideCollision(existing, verdict);
    if (outcome === 'replaced') {
      return this.ingestReplacement(existing, dmarcReport, verdict, provenance);
    }

    await this.dmarcReportRepository.manager.transaction((manager) =>
      this.recordDelivery(manager, existing.id, provenance, verdict, outcome, {
        rejectedXml: outcome === 'conflict' ? dmarcReport.originalXml : null,
      }),
    );
    if (outcome === 'conflict') {
      this.logger.warn(
        `Kept stored report ${existing.id} (reportId=${existing.reportId}, status=${existing.authStatus}); ` +
          `rejected a different copy from ${provenance.source} (status=${provenance.authStatus}, ` +
          `sender=${provenance.authDomain ?? 'n/a'}, messageId=${provenance.sourceMessageId ?? 'n/a'})`,
      );
    }
    return { outcome, report: existing };
  }

  private async ingestNew(
    dmarcReport: Partial<DmarcReport>,
    verdict: ReportVerdict,
    provenance: ReportProvenance,
  ): Promise<IngestResult> {
    const { savedReport, savedRecords } =
      await this.dmarcReportRepository.manager.transaction(async (manager) => {
        const saved = await this.insertReport(manager, {
          ...dmarcReport,
          ...verdict,
        });
        await this.recordDelivery(
          manager,
          saved.savedReport.id,
          provenance,
          verdict,
          'created',
        );
        return saved;
      });

    this.queueIpLookups(savedRecords);
    return { outcome: 'created', report: savedReport };
  }

  private async ingestReplacement(
    existing: DmarcReport,
    dmarcReport: Partial<DmarcReport>,
    verdict: ReportVerdict,
    provenance: ReportProvenance,
  ): Promise<IngestResult> {
    const savedRecords = await this.dmarcReportRepository.manager.transaction(
      async (manager) => {
        await manager
          .getRepository(DmarcRecord)
          .delete({ reportId: existing.id });
        await manager.getRepository(DmarcReport).update(existing.id, {
          reportId: dmarcReport.reportId,
          orgName: dmarcReport.orgName,
          email: dmarcReport.email,
          domain: dmarcReport.domain,
          policy: dmarcReport.policy,
          beginDate: dmarcReport.beginDate,
          endDate: dmarcReport.endDate,
          originalXml: dmarcReport.originalXml,
          ...verdict,
        });
        await this.recordDelivery(
          manager,
          existing.id,
          provenance,
          verdict,
          'replaced',
        );
        return this.insertRecords(manager, existing.id, dmarcReport.records);
      },
    );

    this.logger.warn(
      `Replaced report ${existing.id} (reportId=${existing.reportId}, status=${existing.authStatus}) ` +
        `with an aligned copy from ${provenance.source} (status=${provenance.authStatus}, ` +
        `sender=${provenance.authDomain ?? 'n/a'}, messageId=${provenance.sourceMessageId ?? 'n/a'})`,
    );
    this.queueIpLookups(savedRecords);

    const updatedReport = await this.dmarcReportRepository.findOne({
      where: { id: existing.id },
    });
    if (!updatedReport) {
      throw new BadRequestException('Failed to find updated DMARC report');
    }
    return { outcome: 'replaced', report: updatedReport };
  }

  private async recordDelivery(
    manager: EntityManager,
    reportId: string,
    provenance: ReportProvenance,
    verdict: ReportVerdict,
    outcome: DeliveryOutcome,
    options: { rejectedXml?: string | null } = {},
  ): Promise<void> {
    const repository = manager.getRepository(DmarcReportDelivery);
    let rejectedXml = options.rejectedXml ?? null;
    if (rejectedXml) {
      const kept = await repository.count({
        where: { reportId, outcome: 'conflict', rejectedXml: Not(IsNull()) },
      });
      if (kept >= MAX_REJECTED_COPIES_PER_REPORT) {
        rejectedXml = null;
      }
    }
    await repository.save(
      repository.create({
        reportId,
        source: provenance.source,
        sourceMessageId: provenance.sourceMessageId ?? null,
        contentHash: verdict.contentHash,
        authStatus: provenance.authStatus,
        authMethod: provenance.authMethod ?? null,
        authDomain: verdict.authDomain,
        claimedDomain: verdict.claimedDomain,
        authDetails: provenance.authDetails ?? null,
        outcome,
        rejectedXml,
      }),
    );
  }

  async update(
    id: string,
    dmarcReport: Partial<DmarcReport>,
  ): Promise<DmarcReport | null> {
    const {
      records: _records,
      deliveries: _deliveries,
      ...columns
    } = dmarcReport;
    await this.dmarcReportRepository.update(id, columns);
    return this.dmarcReportRepository.findOne({ where: { id } });
  }

  async remove(id: string): Promise<void> {
    await this.dmarcReportRepository.delete(id);
  }

  async deleteOldReports(
    olderThanDate: Date,
  ): Promise<{ deletedCount: number }> {
    this.logger.log(
      `Deleting reports older than ${olderThanDate.toISOString()}`,
    );

    // Delete in batches to avoid memory issues with large datasets
    // We use raw SQL with LIMIT for better performance and memory efficiency
    const batchSize = 500;
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      // Delete a batch of reports (and their related records via CASCADE)
      // Using a subquery with LIMIT to control batch size
      // Use endDate to ensure multi-day reports are only deleted when fully old
      const result = await this.dmarcReportRepository.query(
        `
        DELETE FROM dmarc_reports 
        WHERE id IN (
          SELECT id FROM dmarc_reports 
          WHERE "endDate" < $1 
          LIMIT $2
        )
        `,
        [olderThanDate, batchSize],
      );

      // result is an array, the second element contains the row count for DELETE
      const deletedInBatch =
        Array.isArray(result) && result.length > 1 ? result[1] : 0;
      totalDeleted += deletedInBatch;

      if (deletedInBatch > 0) {
        this.logger.log(
          `Deleted batch: ${deletedInBatch} reports (total so far: ${totalDeleted})`,
        );
      }

      // If we deleted fewer than batchSize, we're done
      if (deletedInBatch < batchSize) {
        hasMore = false;
      }
    }

    this.logger.log(`Deleted ${totalDeleted} old reports in total`);

    return { deletedCount: totalDeleted };
  }

  async getRecordById(recordId: string) {
    return this.dmarcRecordRepository.findOne({
      where: { id: recordId },
      relations: {
        report: true,
        dkimResults: true,
        spfResults: true,
        policyOverrideReasons: true,
      },
    });
  }

  // ========================================
  // Data Access Helpers
  // ========================================

  async getReportOriginalXml(reportId: string): Promise<string | null> {
    const rep = await this.dmarcReportRepository.findOne({
      where: { id: reportId },
    });
    return rep?.originalXml ?? null;
  }

  async getRecordOriginalXml(recordId: string): Promise<string | null> {
    const record = await this.dmarcRecordRepository.findOne({
      where: { id: recordId },
      relations: { report: true },
    });
    return record?.report?.originalXml || null;
  }

  // ========================================
  // Delegation to Parser Service
  // ========================================

  async parseXmlReport(xmlContent: string): Promise<Partial<DmarcReport>> {
    return this.dmarcParserService.parseXmlReport(xmlContent);
  }

  async unzipReport(fileBuffer: Buffer, fileType: string): Promise<string> {
    return this.dmarcParserService.unzipReport(fileBuffer, fileType);
  }

  // ========================================
  // Delegation to Analytics Service
  // ========================================

  async summaryStats(params: {
    domain?: string;
    from?: Date;
    to?: Date;
  }): Promise<{
    totalReports: number;
    uniqueDomains: number;
    uniqueReportIds: number;
  }> {
    return this.dmarcAnalyticsService.summaryStats(params);
  }

  async timeSeries(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    interval: 'day' | 'week';
  }): Promise<Array<{ date: string; count: number }>> {
    return this.dmarcAnalyticsService.timeSeries(params);
  }

  async topSources(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    limit: number;
  }): Promise<Array<{ source: string; count: number }>> {
    return this.dmarcAnalyticsService.topSources(params);
  }

  async authSummary(params: {
    domain?: string;
    from?: Date;
    to?: Date;
  }): Promise<{
    total: number;
    dkimPass: number;
    spfPass: number;
    dmarcPass: number;
    enforcement: number;
  }> {
    return this.dmarcAnalyticsService.authSummary(params);
  }

  async authBreakdown(params: {
    domain?: string;
    from?: Date;
    to?: Date;
  }): Promise<{
    dkim: {
      pass: number;
      fail: number;
      missing: number;
    };
    spf: {
      pass: number;
      fail: number;
    };
  }> {
    return this.dmarcAnalyticsService.authBreakdown(params);
  }

  async authPassRateTimeseries(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    interval: 'day' | 'week';
  }): Promise<
    Array<{
      date: string;
      dkimPassRate: number;
      spfPassRate: number;
      totalCount: number;
      dkimPassCount: number;
      spfPassCount: number;
    }>
  > {
    return this.dmarcAnalyticsService.authPassRateTimeseries(params);
  }

  async dispositionTimeseries(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    interval: 'day' | 'week';
  }): Promise<
    Array<{
      date: string;
      none: number;
      quarantine: number;
      reject: number;
      total: number;
    }>
  > {
    return this.dmarcAnalyticsService.dispositionTimeseries(params);
  }

  async authMatrix(params: {
    domain?: string;
    from?: Date;
    to?: Date;
  }): Promise<{
    dkimPass_spfPass: number;
    dkimPass_spfFail: number;
    dkimFail_spfPass: number;
    dkimFail_spfFail: number;
  }> {
    return this.dmarcAnalyticsService.authMatrix(params);
  }

  async topIps(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    limit: number;
  }): Promise<
    Array<{
      ip: string;
      total: number;
      pass: number;
      fail: number;
      lastSeen: string;
    }>
  > {
    return this.dmarcAnalyticsService.topIps(params);
  }

  async newIps(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    limit: number;
  }): Promise<
    Array<{
      ip: string;
      firstSeen: string;
      count: number;
    }>
  > {
    return this.dmarcAnalyticsService.newIps(params);
  }

  // ========================================
  // Delegation to Geo Analytics Service
  // ========================================

  async getTopCountries(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<
    Array<{
      country: string;
      count: number;
      dmarcPassCount: number;
      dkimPassCount: number;
      spfPassCount: number;
    }>
  > {
    return this.dmarcGeoAnalyticsService.getTopCountries(params);
  }

  async getTopCountriesPaginated(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }): Promise<{
    data: Array<{
      country: string;
      count: number;
      dmarcPassCount: number;
      dkimPassCount: number;
      spfPassCount: number;
    }>;
    total: number;
  }> {
    return this.dmarcGeoAnalyticsService.getTopCountriesPaginated(params);
  }

  async getGeoHeatmapData(params: {
    domain?: string;
    from?: Date;
    to?: Date;
  }): Promise<
    Array<{
      latitude: number;
      longitude: number;
      count: number;
      passCount: number;
      failCount: number;
      country: string;
    }>
  > {
    return this.dmarcGeoAnalyticsService.getGeoHeatmapData(params);
  }

  async getTopIpsEnhanced(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<{
    data: Array<{
      sourceIp: string;
      count: number;
      passCount: number;
      failCount: number;
      dkimPassCount: number;
      spfPassCount: number;
      country?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.dmarcGeoAnalyticsService.getTopIpsEnhanced(params);
  }

  async getTopHeaderFromDomainsPaginated(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }): Promise<{
    data: Array<{
      headerFrom: string;
      count: number;
      dmarcPassCount: number;
      dkimPassCount: number;
      spfPassCount: number;
    }>;
    total: number;
  }> {
    return this.dmarcGeoAnalyticsService.getTopHeaderFromDomainsPaginated(
      params,
    );
  }

  // ========================================
  // Delegation to Search Service
  // ========================================

  async searchRecords(params: {
    page?: number;
    pageSize?: number;
    domain?: string | string[];
    orgName?: string | string[];
    from?: Date;
    to?: Date;
    disposition?:
      | ('none' | 'quarantine' | 'reject')
      | Array<'none' | 'quarantine' | 'reject'>;
    dkim?: ('pass' | 'fail' | 'missing') | Array<'pass' | 'fail' | 'missing'>;
    spf?: ('pass' | 'fail' | 'missing') | Array<'pass' | 'fail' | 'missing'>;
    sourceIp?: string | string[];
    envelopeTo?: string | string[];
    envelopeFrom?: string | string[];
    headerFrom?: string | string[];
    dkimDomain?: string | string[];
    spfDomain?: string | string[];
    country?: string | string[];
    contains?: string;
    isForwarded?: boolean | null;
    sort?: string;
    order?: 'asc' | 'desc';
  }): Promise<PagedResult<DmarcRecord>> {
    return this.dmarcSearchService.searchRecords(params);
  }

  async getDistinctValues(
    field:
      | 'domain'
      | 'orgName'
      | 'sourceIp'
      | 'envelopeTo'
      | 'envelopeFrom'
      | 'headerFrom'
      | 'dkimDomain'
      | 'spfDomain'
      | 'country',
    from?: Date,
    to?: Date,
  ) {
    return this.dmarcSearchService.getDistinctValues(field, from, to);
  }

  async getDomains(): Promise<string[]> {
    return this.dmarcSearchService.getDomains();
  }

  async getReportDomains(): Promise<string[]> {
    return this.dmarcSearchService.getReportDomains();
  }
}
