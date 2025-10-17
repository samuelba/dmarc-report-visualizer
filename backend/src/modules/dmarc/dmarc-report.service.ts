import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { DmarcReport } from './entities/dmarc-report.entity';
import { DmarcRecord } from './entities/dmarc-record.entity';
import { DkimResult } from './entities/dkim-result.entity';
import { SpfResult } from './entities/spf-result.entity';
import { PolicyOverrideReason } from './entities/policy-override-reason.entity';
import { DmarcParserService } from './services/dmarc-parser.service';
import { DmarcAnalyticsService } from './services/dmarc-analytics.service';
import { DmarcGeoAnalyticsService } from './services/dmarc-geo-analytics.service';
import {
  DmarcSearchService,
  PagedResult,
} from './services/dmarc-search.service';

export { PagedResult };

@Injectable()
export class DmarcReportService {
  private readonly logger = new Logger(DmarcReportService.name);

  constructor(
    @InjectRepository(DmarcReport)
    private dmarcReportRepository: Repository<DmarcReport>,
    @InjectRepository(DmarcRecord)
    private dmarcRecordRepository: Repository<DmarcRecord>,
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
      relations: {
        records: {
          dkimResults: true,
          spfResults: true,
          policyOverrideReasons: true,
        },
      },
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
      relations: {
        records: {
          dkimResults: true,
          spfResults: true,
          policyOverrideReasons: true,
        },
      },
    });

    return { data, total, page, pageSize };
  }

  async findOne(id: string): Promise<DmarcReport | null> {
    return this.dmarcReportRepository.findOne({
      where: { id },
      relations: {
        records: {
          dkimResults: true,
          spfResults: true,
          policyOverrideReasons: true,
        },
      },
    });
  }

  async findByReportId(reportId: string): Promise<DmarcReport | null> {
    return this.dmarcReportRepository.findOne({
      where: { reportId },
      relations: {
        records: {
          dkimResults: true,
          spfResults: true,
          policyOverrideReasons: true,
        },
      },
    });
  }

  async create(dmarcReport: Partial<DmarcReport>): Promise<DmarcReport> {
    // Extract records before creating the report
    const { records, ...reportData } = dmarcReport;

    // Create and save the report first
    const newReport = this.dmarcReportRepository.create(reportData);
    const savedReport = await this.dmarcReportRepository.save(newReport);

    // Create and save the records with proper relationships
    if (records && records.length > 0) {
      for (const recordData of records) {
        const record = this.dmarcRecordRepository.create({
          ...recordData,
          reportId: savedReport.id,
        });
        await this.dmarcRecordRepository.save(record);
      }
    }

    // Return the report with all relations loaded
    const fullReport = await this.findByReportId(savedReport.reportId);
    return fullReport || savedReport;
  }

  async createOrUpdateByReportId(
    dmarcReport: Partial<DmarcReport>,
  ): Promise<DmarcReport> {
    if (!dmarcReport.reportId) {
      return this.create(dmarcReport);
    }

    // Check if report already exists
    const existing = await this.dmarcReportRepository.findOne({
      where: { reportId: dmarcReport.reportId },
      relations: {
        records: {
          dkimResults: true,
          spfResults: true,
          policyOverrideReasons: true,
        },
      },
    });

    if (existing) {
      // Delete existing records to replace them
      await this.dmarcRecordRepository.delete({ reportId: existing.id });

      // Update the report fields
      await this.dmarcReportRepository.update(existing.id, {
        reportId: dmarcReport.reportId,
        orgName: dmarcReport.orgName,
        email: dmarcReport.email,
        domain: dmarcReport.domain,
        policy: dmarcReport.policy,
        beginDate: dmarcReport.beginDate,
        endDate: dmarcReport.endDate,
        originalXml: (dmarcReport as any).originalXml,
      });

      // Create new records with proper relationships
      if (dmarcReport.records && dmarcReport.records.length > 0) {
        for (const recordData of dmarcReport.records) {
          const record = this.dmarcRecordRepository.create({
            ...recordData,
            reportId: existing.id,
          });
          await this.dmarcRecordRepository.save(record);
        }
      }

      const updatedReport = await this.findByReportId(dmarcReport.reportId);
      if (!updatedReport) {
        throw new BadRequestException('Failed to find updated DMARC report');
      }
      return updatedReport;
    } else {
      return this.create(dmarcReport);
    }
  }

  async update(
    id: string,
    dmarcReport: Partial<DmarcReport>,
  ): Promise<DmarcReport | null> {
    await this.dmarcReportRepository.update(id, dmarcReport);
    return this.dmarcReportRepository.findOne({ where: { id } });
  }

  async remove(id: string): Promise<void> {
    await this.dmarcReportRepository.delete(id);
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
      countryName: string;
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
      countryName: string;
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
      countryName?: string;
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
