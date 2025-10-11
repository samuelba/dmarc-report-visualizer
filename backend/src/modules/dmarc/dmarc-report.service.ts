import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { DmarcReport } from './entities/dmarc-report.entity';
import { DmarcRecord } from './entities/dmarc-record.entity';
import { DkimResult } from './entities/dkim-result.entity';
import { SpfResult } from './entities/spf-result.entity';
import { PolicyOverrideReason } from './entities/policy-override-reason.entity';
import { GeolocationService } from './services/geolocation.service';
import { ForwardingDetectionService } from './services/forwarding-detection.service';
import { XMLParser } from 'fast-xml-parser';
import * as zlib from 'zlib';
const AdmZip = require('adm-zip');
import * as unzipper from 'unzipper';

export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

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
    private geolocationService: GeolocationService,
    private forwardingDetectionService: ForwardingDetectionService,
  ) {}

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

  // Simple stats based on available fields. If 'records' JSON is normalized later, move to SQL-level aggregations.
  async summaryStats(params: {
    domain?: string;
    from?: Date;
    to?: Date;
  }): Promise<{
    totalReports: number;
    uniqueDomains: number;
    uniqueReportIds: number;
  }> {
    const { domain, from, to } = params;
    const where: FindOptionsWhere<DmarcReport> = {};
    if (domain) where.domain = ILike(`%${domain}%`);
    if (from || to)
      where.beginDate = Between(
        from ?? new Date(0),
        to ?? new Date('2999-12-31'),
      );

    const [rows, totalReports, uniqueDomains, uniqueReportIds] =
      await Promise.all([
        this.dmarcReportRepository.find({ where }),
        this.dmarcReportRepository.count({ where }),
        this.dmarcReportRepository
          .createQueryBuilder('r')
          .select('COUNT(DISTINCT r.domain)', 'count')
          .where(
            where.domain ? 'r.domain ILIKE :domain' : '1=1',
            where.domain ? { domain: `%${domain}%` } : {},
          )
          .getRawOne()
          .then((x) => Number(x?.count ?? 0)),
        this.dmarcReportRepository
          .createQueryBuilder('r')
          .select('COUNT(DISTINCT r.reportId)', 'count')
          .where(
            where.domain ? 'r.domain ILIKE :domain' : '1=1',
            where.domain ? { domain: `%${domain}%` } : {},
          )
          .getRawOne()
          .then((x) => Number(x?.count ?? 0)),
      ]);

    return {
      totalReports,
      uniqueDomains,
      uniqueReportIds,
    };
  }

  async timeSeries(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    interval: 'day' | 'week';
  }): Promise<Array<{ date: string; count: number }>> {
    const { domain, from, to, interval } = params;

    const dateTrunc = interval === 'week' ? 'week' : 'day';

    if (domain) {
      // When filtering by headerFrom, count distinct reports that contain matching records
      const qb = this.dmarcReportRepository
        .createQueryBuilder('rep')
        .innerJoin('rep.records', 'rec', 'rec.headerFrom ILIKE :domain', {
          domain: `%${domain}%`,
        });

      if (from) qb.andWhere('rep.beginDate >= :from', { from });
      if (to) qb.andWhere('rep.beginDate <= :to', { to });

      const rows = await qb
        .select(`DATE_TRUNC('${dateTrunc}', rep.beginDate)`, 'bucket')
        .addSelect('COUNT(DISTINCT rep.id)', 'count')
        .groupBy('bucket')
        .orderBy('bucket', 'ASC')
        .getRawMany<{ bucket: string; count: string }>();

      return rows.map((r) => ({ date: r.bucket, count: Number(r.count) }));
    } else {
      // When not filtering, just count all reports
      const qb = this.dmarcReportRepository.createQueryBuilder('rep');
      if (from) qb.andWhere('rep.beginDate >= :from', { from });
      if (to) qb.andWhere('rep.beginDate <= :to', { to });

      const rows = await qb
        .select(`DATE_TRUNC('${dateTrunc}', rep.beginDate)`, 'bucket')
        .addSelect('COUNT(rep.id)', 'count')
        .groupBy('bucket')
        .orderBy('bucket', 'ASC')
        .getRawMany<{ bucket: string; count: string }>();

      return rows.map((r) => ({ date: r.bucket, count: Number(r.count) }));
    }
  }

  async topSources(params: {
    domain?: string;
    from?: Date;
    to?: Date;
    limit: number;
  }): Promise<Array<{ source: string; count: number }>> {
    const { domain, from, to, limit } = params;

    const qb = this.dmarcReportRepository.createQueryBuilder('r');
    if (domain)
      qb.andWhere('r.domain ILIKE :domain', { domain: `%${domain}%` });
    if (from) qb.andWhere('r.beginDate >= :from', { from });
    if (to) qb.andWhere('r.beginDate <= :to', { to });

    const rows = await qb
      .select('r.domain', 'source')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.domain')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany<{ source: string; count: string }>();

    return rows.map((r) => ({ source: r.source, count: Number(r.count) }));
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
    const { domain, from, to } = params;
    const qb = this.dmarcRecordRepository
      .createQueryBuilder('rec')
      .leftJoin('rec.report', 'rep');
    if (domain)
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    if (from) qb.andWhere('rep.beginDate >= :from', { from });
    if (to) qb.andWhere('rep.beginDate <= :to', { to });

    const row = await qb
      .select('COALESCE(SUM(rec.count),0)', 'total')
      .addSelect(
        `COALESCE(SUM(CASE WHEN rec.dmarcDkim = 'pass' THEN rec.count ELSE 0 END),0)`,
        'dkimPass',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN rec.dmarcSpf = 'pass' THEN rec.count ELSE 0 END),0)`,
        'spfPass',
      )
      .addSelect(
        // DMARC passes if either DKIM or SPF passes (from policy_evaluated)
        `COALESCE(SUM(CASE WHEN (rec.dmarcDkim = 'pass' OR rec.dmarcSpf = 'pass') THEN rec.count ELSE 0 END),0)`,
        'dmarcPass',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN rec.disposition IN ('quarantine','reject') THEN rec.count ELSE 0 END),0)`,
        'enforcement',
      )
      .getRawOne<{
        total: string;
        dkimPass: string;
        spfPass: string;
        dmarcPass: string;
        enforcement: string;
      }>();

    return {
      total: Number(row?.total ?? 0),
      dkimPass: Number(row?.dkimPass ?? 0),
      spfPass: Number(row?.spfPass ?? 0),
      dmarcPass: Number(row?.dmarcPass ?? 0),
      enforcement: Number(row?.enforcement ?? 0),
    };
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
    const { domain, from, to } = params;
    const qb = this.dmarcRecordRepository
      .createQueryBuilder('rec')
      .leftJoin('rec.report', 'rep');

    if (domain)
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    if (from) qb.andWhere('rep.beginDate >= :from', { from });
    if (to) qb.andWhere('rep.beginDate <= :to', { to });

    const row = await qb
      .select(
        `COALESCE(SUM(CASE WHEN rec.dmarcDkim = 'pass' THEN rec.count ELSE 0 END),0)`,
        'dkimPass',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN rec.dmarcDkim = 'fail' AND rec.dkimMissing = false THEN rec.count ELSE 0 END),0)`,
        'dkimFail',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN rec.dkimMissing = true THEN rec.count ELSE 0 END),0)`,
        'dkimMissing',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN rec.dmarcSpf = 'pass' THEN rec.count ELSE 0 END),0)`,
        'spfPass',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN rec.dmarcSpf = 'fail' THEN rec.count ELSE 0 END),0)`,
        'spfFail',
      )
      .getRawOne<{
        dkimPass: string;
        dkimFail: string;
        dkimMissing: string;
        spfPass: string;
        spfFail: string;
      }>();

    return {
      dkim: {
        pass: Number(row?.dkimPass ?? 0),
        fail: Number(row?.dkimFail ?? 0),
        missing: Number(row?.dkimMissing ?? 0),
      },
      spf: {
        pass: Number(row?.spfPass ?? 0),
        fail: Number(row?.spfFail ?? 0),
      },
    };
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
    const { domain, from, to, interval } = params;
    const dateTrunc = interval === 'week' ? 'week' : 'day';
    const qb = this.dmarcRecordRepository
      .createQueryBuilder('rec')
      .leftJoin('rec.report', 'rep');
    if (domain)
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    if (from) qb.andWhere('rep.beginDate >= :from', { from });
    if (to) qb.andWhere('rep.beginDate <= :to', { to });

    const rows = await qb
      .select(`DATE_TRUNC('${dateTrunc}', rep.beginDate)`, 'bucket')
      .addSelect(`COALESCE(SUM(rec.count),0)`, 'total')
      .addSelect(
        `COALESCE(SUM(CASE WHEN rec.dmarcDkim = 'pass' THEN rec.count ELSE 0 END),0)`,
        'dkimPass',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN rec.dmarcSpf = 'pass' THEN rec.count ELSE 0 END),0)`,
        'spfPass',
      )
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany<{
        bucket: string;
        total: string;
        dkimPass: string;
        spfPass: string;
      }>();

    return rows.map((r) => {
      const total = Number(r.total ?? 0);
      const dkimPass = Number(r.dkimPass ?? 0);
      const spfPass = Number(r.spfPass ?? 0);
      return {
        date: r.bucket,
        totalCount: total,
        dkimPassCount: dkimPass,
        spfPassCount: spfPass,
        dkimPassRate:
          total > 0 ? Math.round((dkimPass / total) * 10000) / 100 : 0,
        spfPassRate:
          total > 0 ? Math.round((spfPass / total) * 10000) / 100 : 0,
      };
    });
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
    const { domain, from, to, interval } = params;
    const dateTrunc = interval === 'week' ? 'week' : 'day';
    const qb = this.dmarcRecordRepository
      .createQueryBuilder('rec')
      .leftJoin('rec.report', 'rep');
    if (domain)
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    if (from) qb.andWhere('rep.beginDate >= :from', { from });
    if (to) qb.andWhere('rep.beginDate <= :to', { to });

    const rows = await qb
      .select(`DATE_TRUNC('${dateTrunc}', rep.beginDate)`, 'bucket')
      .addSelect(
        `COALESCE(SUM(CASE WHEN COALESCE(rec.disposition,'none') = 'none' THEN rec.count ELSE 0 END),0)`,
        'none',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN rec.disposition = 'quarantine' THEN rec.count ELSE 0 END),0)`,
        'quarantine',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN rec.disposition = 'reject' THEN rec.count ELSE 0 END),0)`,
        'reject',
      )
      .addSelect(`COALESCE(SUM(rec.count),0)`, 'total')
      .groupBy('bucket')
      .orderBy('bucket', 'ASC')
      .getRawMany<{
        bucket: string;
        none: string;
        quarantine: string;
        reject: string;
        total: string;
      }>();

    return rows.map((r) => ({
      date: r.bucket,
      none: Number(r.none ?? 0),
      quarantine: Number(r.quarantine ?? 0),
      reject: Number(r.reject ?? 0),
      total: Number(r.total ?? 0),
    }));
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
    const { domain, from, to } = params;
    const qb = this.dmarcRecordRepository
      .createQueryBuilder('rec')
      .leftJoin('rec.report', 'rep');
    if (domain)
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    if (from) qb.andWhere('rep.beginDate >= :from', { from });
    if (to) qb.andWhere('rep.beginDate <= :to', { to });

    const row = await qb
      .select(
        `SUM(CASE WHEN rec.dmarcDkim = 'pass' AND rec.dmarcSpf = 'pass' THEN 1 ELSE 0 END)`,
        'pp',
      )
      .addSelect(
        `SUM(CASE WHEN rec.dmarcDkim = 'pass' AND COALESCE(rec.dmarcSpf,'fail') <> 'pass' THEN 1 ELSE 0 END)`,
        'pf',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(rec.dmarcDkim,'fail') <> 'pass' AND rec.dmarcSpf = 'pass' THEN 1 ELSE 0 END)`,
        'fp',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(rec.dmarcDkim,'fail') <> 'pass' AND COALESCE(rec.dmarcSpf,'fail') <> 'pass' THEN 1 ELSE 0 END)`,
        'ff',
      )
      .getRawOne<{ pp: string; pf: string; fp: string; ff: string }>();

    return {
      dkimPass_spfPass: Number(row?.pp ?? 0),
      dkimPass_spfFail: Number(row?.pf ?? 0),
      dkimFail_spfPass: Number(row?.fp ?? 0),
      dkimFail_spfFail: Number(row?.ff ?? 0),
    };
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
    const { domain, from, to, limit } = params;
    const qb = this.dmarcRecordRepository
      .createQueryBuilder('rec')
      .leftJoin('rec.report', 'rep');
    if (domain)
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    if (from) qb.andWhere('rep.beginDate >= :from', { from });
    if (to) qb.andWhere('rep.beginDate <= :to', { to });

    const rows = await qb
      .select('rec.sourceIp', 'ip')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        // DMARC passes if either DKIM or SPF passes (from policy_evaluated)
        `SUM(CASE WHEN (rec.dmarcDkim = 'pass' OR rec.dmarcSpf = 'pass') THEN 1 ELSE 0 END)`,
        'pass',
      )
      .addSelect(
        `SUM(CASE WHEN NOT (rec.dmarcDkim = 'pass' OR rec.dmarcSpf = 'pass') THEN 1 ELSE 0 END)`,
        'fail',
      )
      .addSelect('MAX(rep.beginDate)', 'lastSeen')
      .where('rec.sourceIp IS NOT NULL')
      .groupBy('rec.sourceIp')
      .orderBy('total', 'DESC')
      .limit(limit)
      .getRawMany<{
        ip: string;
        total: string;
        pass: string;
        fail: string;
        lastSeen: string;
      }>();

    return rows.map((r) => ({
      ip: r.ip,
      total: Number(r.total ?? 0),
      pass: Number(r.pass ?? 0),
      fail: Number(r.fail ?? 0),
      lastSeen: r.lastSeen,
    }));
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
    const { domain, from, to, limit } = params;
    const qb = this.dmarcRecordRepository
      .createQueryBuilder('rec')
      .leftJoin('rec.report', 'rep');
    if (domain)
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    if (from) qb.andWhere('rep.beginDate >= :from', { from });
    if (to) qb.andWhere('rep.beginDate <= :to', { to });

    const rows = await qb
      .select('rec.sourceIp', 'ip')
      .addSelect('MIN(rep.beginDate)', 'firstSeen')
      .addSelect('COUNT(*)', 'count')
      .where('rec.sourceIp IS NOT NULL')
      .groupBy('rec.sourceIp')
      .orderBy('firstSeen', 'DESC')
      .limit(limit)
      .getRawMany<{ ip: string; firstSeen: string; count: string }>();

    return rows.map((r) => ({
      ip: r.ip,
      firstSeen: r.firstSeen,
      count: Number(r.count ?? 0),
    }));
  }

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
    envelopeFrom?: string | string[]; // headerFrom or envelope_from
    headerFrom?: string | string[];
    dkimDomain?: string | string[];
    spfDomain?: string | string[];
    country?: string | string[];
    contains?: string;
    isForwarded?: boolean | null;
    sort?: string;
    order?: 'asc' | 'desc';
  }): Promise<PagedResult<DmarcRecord>> {
    const {
      page = 1,
      pageSize = 20,
      domain,
      orgName,
      from,
      to,
      disposition,
      dkim,
      spf,
      sourceIp,
      envelopeTo,
      envelopeFrom,
      headerFrom,
      dkimDomain,
      spfDomain,
      country,
      contains,
    } = params;

    const qb = this.dmarcRecordRepository
      .createQueryBuilder('rec')
      .leftJoinAndSelect('rec.report', 'rep')
      .leftJoinAndSelect('rec.dkimResults', 'dk')
      .leftJoinAndSelect('rec.spfResults', 'sf');

    if (domain) {
      const arr = Array.isArray(domain) ? domain : [domain];
      qb.andWhere('rep.domain ILIKE ANY(:domains)', {
        domains: arr.map((d) => `%${d}%`),
      });
    }
    if (orgName) {
      const arr = Array.isArray(orgName) ? orgName : [orgName];
      qb.andWhere('rep.orgName ILIKE ANY(:orgNames)', {
        orgNames: arr.map((o) => `%${o}%`),
      });
    }
    if (from) qb.andWhere('rep.beginDate >= :from', { from });
    if (to) qb.andWhere('rep.beginDate <= :to', { to });
    if (disposition) {
      const arr = Array.isArray(disposition) ? disposition : [disposition];
      qb.andWhere('rec.disposition IN (:...disps)', { disps: arr });
    }
    if (dkim) {
      const arr = Array.isArray(dkim) ? dkim : [dkim];
      const hasMissing = arr.includes('missing');
      const others = arr.filter((v) => v !== 'missing');

      if (hasMissing && others.length > 0) {
        // Include both missing records and other specified statuses
        qb.andWhere(
          `(
          rec.dmarcDkim IN (:...dkims) OR
          (rec.dmarcDkim = 'fail' AND NOT EXISTS (
            SELECT 1 FROM dkim_results dk WHERE dk.recordId = rec.id
          ))
        )`,
          { dkims: others },
        );
      } else if (hasMissing) {
        // Only missing records: policy_evaluated = 'fail' but no auth_results
        qb.andWhere(`(
          rec.dmarcDkim = 'fail' AND NOT EXISTS (
            SELECT 1 FROM dkim_results dk WHERE dk.recordId = rec.id
          )
        )`);
      } else if (others.length > 0) {
        // Handle 'fail' specifically: only records with auth_results
        const hasFailOnly = others.length === 1 && others[0] === 'fail';
        if (hasFailOnly) {
          qb.andWhere(`(
            rec.dmarcDkim = 'fail' AND EXISTS (
              SELECT 1 FROM dkim_results dk WHERE dk.recordId = rec.id
            )
          )`);
        } else {
          // For 'pass' or mixed filters, use simple IN clause
          qb.andWhere('rec.dmarcDkim IN (:...dkims)', { dkims: others });
        }
      }
    }
    if (spf) {
      const arr = Array.isArray(spf) ? spf : [spf];
      const hasMissing = arr.includes('missing');
      const others = arr.filter((v) => v !== 'missing');

      if (hasMissing && others.length > 0) {
        // Include both missing records and other specified statuses
        qb.andWhere(
          `(
          rec.dmarcSpf IN (:...spfs) OR
          (rec.dmarcSpf = 'fail' AND NOT EXISTS (
            SELECT 1 FROM spf_results sf WHERE sf.recordId = rec.id
          ))
        )`,
          { spfs: others },
        );
      } else if (hasMissing) {
        // Only missing records: policy_evaluated = 'fail' but no auth_results
        qb.andWhere(`(
          rec.dmarcSpf = 'fail' AND NOT EXISTS (
            SELECT 1 FROM spf_results sf WHERE sf.recordId = rec.id
          )
        )`);
      } else if (others.length > 0) {
        // Handle 'fail' specifically: only records with auth_results
        const hasFailOnly = others.length === 1 && others[0] === 'fail';
        if (hasFailOnly) {
          qb.andWhere(`(
            rec.dmarcSpf = 'fail' AND EXISTS (
              SELECT 1 FROM spf_results sf WHERE sf.recordId = rec.id
            )
          )`);
        } else {
          // For 'pass' or mixed filters, use simple IN clause
          qb.andWhere('rec.dmarcSpf IN (:...spfs)', { spfs: others });
        }
      }
    }
    if (sourceIp) {
      const arr = Array.isArray(sourceIp) ? sourceIp : [sourceIp];
      qb.andWhere('rec.sourceIp = ANY(:ips)', { ips: arr });
    }
    if (envelopeTo) {
      const arr = Array.isArray(envelopeTo) ? envelopeTo : [envelopeTo];
      qb.andWhere('rec.envelopeTo ILIKE ANY(:etos)', {
        etos: arr.map((v) => `%${v}%`),
      });
    }
    if (headerFrom) {
      const arr = Array.isArray(headerFrom) ? headerFrom : [headerFrom];
      qb.andWhere('rec.headerFrom ILIKE ANY(:hfs)', {
        hfs: arr.map((v) => `%${v}%`),
      });
    }
    if (envelopeFrom) {
      const arr = Array.isArray(envelopeFrom) ? envelopeFrom : [envelopeFrom];
      qb.andWhere('rec.envelopeFrom ILIKE ANY(:efs)', {
        efs: arr.map((v) => `%${v}%`),
      });
    }
    if (dkimDomain) {
      const arr = Array.isArray(dkimDomain) ? dkimDomain : [dkimDomain];
      // Use a subquery to filter records that have at least one matching DKIM domain
      // This way we don't filter out other DKIM results from the same record
      qb.andWhere(
        `EXISTS (
        SELECT 1 FROM dkim_results dk_filter
        WHERE dk_filter."recordId" = rec.id
        AND dk_filter.domain ILIKE ANY(:dkdoms)
      )`,
        {
          dkdoms: arr.map((v) => `%${v}%`),
        },
      );
    }
    if (spfDomain) {
      const arr = Array.isArray(spfDomain) ? spfDomain : [spfDomain];
      // Use a subquery to filter records that have at least one matching SPF domain
      // This way we don't filter out other SPF results from the same record
      qb.andWhere(
        `EXISTS (
        SELECT 1 FROM spf_results sf_filter
        WHERE sf_filter."recordId" = rec.id
        AND sf_filter.domain ILIKE ANY(:sfdoms)
      )`,
        {
          sfdoms: arr.map((v) => `%${v}%`),
        },
      );
    }
    if (country) {
      const arr = Array.isArray(country) ? country : [country];
      qb.andWhere('rec.geoCountry ILIKE ANY(:ctys)', {
        ctys: arr.map((v) => `%${v}%`),
      });
    }

    // Filter by forwarding status
    if (params.isForwarded !== undefined) {
      if (params.isForwarded === true) {
        qb.andWhere('rec.isForwarded = :isForwarded', { isForwarded: true });
      } else if (params.isForwarded === false) {
        qb.andWhere('rec.isForwarded = :isForwarded', { isForwarded: false });
      } else if (params.isForwarded === null) {
        qb.andWhere('rec.isForwarded IS NULL');
      }
    }

    // Contains filter - search across all main text columns (case insensitive)
    if (contains) {
      const searchTerm = `%${contains.toLowerCase()}%`;
      qb.andWhere(
        `(
        LOWER(CAST(rec.sourceIp AS TEXT)) LIKE :searchTerm OR
        LOWER(rec.disposition) LIKE :searchTerm OR
        LOWER(rec.dmarcDkim) LIKE :searchTerm OR
        LOWER(rec.dmarcSpf) LIKE :searchTerm OR
        LOWER(rec.envelopeTo) LIKE :searchTerm OR
        LOWER(rec.envelopeFrom) LIKE :searchTerm OR
        LOWER(rec.headerFrom) LIKE :searchTerm OR
        LOWER(rec.geoCountry) LIKE :searchTerm OR
        LOWER(rec.geoCountryName) LIKE :searchTerm OR
        LOWER(rec.geoCity) LIKE :searchTerm OR
        LOWER(rec.reasonType) LIKE :searchTerm OR
        LOWER(rec.reasonComment) LIKE :searchTerm OR
        LOWER(rec.forwardReason) LIKE :searchTerm OR
        LOWER(rep.domain) LIKE :searchTerm OR
        LOWER(rep.orgName) LIKE :searchTerm OR
        EXISTS (SELECT 1 FROM dkim_results dk_search WHERE dk_search."recordId" = rec.id AND (LOWER(dk_search.domain) LIKE :searchTerm OR LOWER(dk_search.result) LIKE :searchTerm)) OR
        EXISTS (SELECT 1 FROM spf_results sf_search WHERE sf_search."recordId" = rec.id AND (LOWER(sf_search.domain) LIKE :searchTerm OR LOWER(sf_search.result) LIKE :searchTerm))
      )`,
        { searchTerm },
      );
    }

    const sortsMap: Record<string, string> = {
      date: 'rep.beginDate',
      ip: 'rec.sourceIp',
      count: 'rec.count',
      disposition: 'rec.disposition',
      dkim: 'rec.dmarcDkim',
      spf: 'rec.dmarcSpf',
      headerFrom: 'rec.headerFrom',
      envelopeTo: 'rec.envelopeTo',
      envelopeFrom: 'rec.envelopeFrom',
      country: 'rec.geoCountry',
      isForwarded: 'rec.isForwarded',
    };
    const col =
      params.sort && sortsMap[params.sort]
        ? sortsMap[params.sort]
        : 'rep.beginDate';
    const dir = (params.order || 'desc').toUpperCase() as 'ASC' | 'DESC';
    qb.orderBy(col, dir)
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { data: rows, total, page, pageSize };
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
    if (field === 'domain') {
      const qb = this.dmarcReportRepository
        .createQueryBuilder('rep')
        .select('DISTINCT rep.domain', 'v')
        .where('rep.domain IS NOT NULL');
      if (from) qb.andWhere('rep.beginDate >= :from', { from });
      if (to) qb.andWhere('rep.beginDate <= :to', { to });
      const rows = await qb.orderBy('v', 'ASC').getRawMany();
      return rows.map((r) => r.v).filter(Boolean);
    }
    if (field === 'orgName') {
      const qb = this.dmarcReportRepository
        .createQueryBuilder('rep')
        .select('DISTINCT rep.orgName', 'v')
        .where('rep.orgName IS NOT NULL');
      if (from) qb.andWhere('rep.beginDate >= :from', { from });
      if (to) qb.andWhere('rep.beginDate <= :to', { to });
      const rows = await qb.orderBy('v', 'ASC').getRawMany();
      return rows.map((r) => r.v).filter(Boolean);
    }
    if (field === 'dkimDomain') {
      // Filter DKIM domains by date range using record's report relationship
      const qb = this.dkimResultRepository
        .createQueryBuilder('dk')
        .innerJoin('dk.record', 'rec')
        .innerJoin('rec.report', 'rep')
        .select('DISTINCT dk.domain', 'v')
        .where('dk.domain IS NOT NULL');
      if (from) qb.andWhere('rep.beginDate >= :from', { from });
      if (to) qb.andWhere('rep.beginDate <= :to', { to });
      const rows = await qb.orderBy('v', 'ASC').getRawMany();
      return rows.map((r) => r.v).filter(Boolean);
    }
    if (field === 'spfDomain') {
      // Filter SPF domains by date range using record's report relationship
      const qb = this.spfResultRepository
        .createQueryBuilder('sf')
        .innerJoin('sf.record', 'rec')
        .innerJoin('rec.report', 'rep')
        .select('DISTINCT sf.domain', 'v')
        .where('sf.domain IS NOT NULL');
      if (from) qb.andWhere('rep.beginDate >= :from', { from });
      if (to) qb.andWhere('rep.beginDate <= :to', { to });
      const rows = await qb.orderBy('v', 'ASC').getRawMany();
      return rows.map((r) => r.v).filter(Boolean);
    }
    const map: any = {
      sourceIp: 'rec.sourceIp',
      envelopeTo: 'rec.envelopeTo',
      envelopeFrom: 'rec.envelopeFrom',
      headerFrom: 'rec.headerFrom',
      country: 'rec.geoCountry',
    };
    const col = map[field];
    const qb = this.dmarcRecordRepository
      .createQueryBuilder('rec')
      .leftJoin('rec.report', 'rep')
      .select(`DISTINCT ${col}`, 'v')
      .where(`${col} IS NOT NULL`);
    if (from) qb.andWhere('rep.beginDate >= :from', { from });
    if (to) qb.andWhere('rep.beginDate <= :to', { to });
    const rows = await qb.orderBy('v', 'ASC').getRawMany();
    return rows.map((r: any) => r.v).filter(Boolean);
  }

  private coerceToArray<T>(maybeArray: T | T[] | undefined): T[] {
    if (!maybeArray) return [];
    return Array.isArray(maybeArray) ? maybeArray : [maybeArray];
  }

  // Method to parse XML DMARC report
  async parseXmlReport(xmlContent: string): Promise<Partial<DmarcReport>> {
    if (!xmlContent || typeof xmlContent !== 'string') {
      throw new BadRequestException('Invalid XML content');
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      allowBooleanAttributes: true,
      trimValues: true,
      parseTagValue: true,
      parseAttributeValue: true,
      isArray: (
        tagName: string,
        jPath: string,
        isLeafNode: boolean,
        isAttribute: boolean,
      ): boolean => {
        return (
          tagName === 'record' ||
          tagName === 'dkim' ||
          tagName === 'spf' ||
          tagName === 'reason'
        );
      },
    } as any);

    let parsed: any;
    try {
      parsed = parser.parse(xmlContent);
    } catch (err) {
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
      if (!recordData || typeof recordData !== 'object') continue;

      const row = recordData.row || {};
      // Support both 'identifiers' and 'identities' (both are valid per DMARC spec)
      const identifiers = recordData.identifiers || recordData.identities || {};
      const authResults = recordData.auth_results || {};
      const policyEvaluated = row.policy_evaluated || {};

      const normalizePassFail = (v: any): 'pass' | 'fail' | undefined => {
        // Handle both string and array formats (some XML parsers return arrays)
        const value = Array.isArray(v) ? v[0] : v;
        if (typeof value !== 'string') return undefined;
        const val = value.toLowerCase();
        if (val === 'pass') return 'pass';
        if (val === 'fail') return 'fail';
        return undefined;
      };

      const normalizeDisposition = (
        v: any,
      ): 'none' | 'quarantine' | 'reject' | undefined => {
        if (typeof v !== 'string') return undefined;
        const val = v.toLowerCase();
        if (val === 'none' || val === 'quarantine' || val === 'reject')
          return val as any;
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
        sourceIp: row.source_ip,
        count: row.count ? parseInt(row.count.toString()) : undefined,
        disposition: normalizeDisposition(policyEvaluated.disposition),
        dmarcDkim: normalizePassFail(policyEvaluated.dkim),
        dmarcSpf: normalizePassFail(policyEvaluated.spf),
        envelopeTo: identifiers.envelope_to,
        envelopeFrom: identifiers.envelope_from,
        headerFrom: identifiers.header_from,
        reasonType: primaryReason?.type,
        reasonComment: primaryReason?.comment,
      };

      // Parse DKIM results
      const dkimResults: Partial<DkimResult>[] = [];
      const dkimArray = this.coerceToArray(authResults.dkim || []);
      for (const dkim of dkimArray) {
        if (dkim && typeof dkim === 'object') {
          dkimResults.push({
            domain: dkim.domain,
            selector: dkim.selector,
            result:
              typeof dkim.result === 'string'
                ? ((dkim.result as string).toLowerCase() as any)
                : undefined,
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
          spfResults.push({
            domain: spf.domain,
            result:
              typeof spf.result === 'string'
                ? ((spf.result as string).toLowerCase() as any)
                : undefined,
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
          }
        } catch (error) {
          this.logger.warn(
            `Failed to get geolocation for IP ${dmarcRecord.sourceIp}: ${error instanceof Error ? error.message : String(error)}`,
          );
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

  // Method to unzip DMARC report
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
      } catch (e) {
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
          const data = xmlEntry.getData();
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
          const data = gzEntry.getData();
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
        const data = entries[0].getData();
        const result = data.toString('utf8');
        this.logger.debug(
          `AdmZip fallback extraction successful: ${result.length} characters`,
        );
        return result;
      } catch (admZipError) {
        // Log the AdmZip error for debugging
        this.logger.warn(`AdmZip failed for file: ${admZipError.message}`);
        this.logger.debug(`AdmZip error stack: ${admZipError.stack}`);

        // Only fallback to unzipper for specific ZIP format errors
        // For other errors (like data extraction issues), re-throw immediately
        const isZipFormatError =
          admZipError.message.includes('Invalid or unsupported zip format') ||
          admZipError.message.includes('Invalid CEN header') ||
          admZipError.message.includes('Invalid LOC header') ||
          admZipError.message.includes('bad signature') ||
          admZipError.message.includes('Invalid zip file');

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
          const xmlBuf = await xmlFile.buffer();
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
          const gzBuf = await gzFile.buffer();
          const result = this.decompressGzipToString(gzBuf);
          this.logger.debug(
            `Unzipper GZ extraction successful: ${result.length} characters`,
          );
          return result;
        }
        // Fallback: first file as text
        this.logger.debug(`Using first file as fallback: ${files[0].path}`);
        const xmlBuf = await files[0].buffer();
        const result = xmlBuf.toString('utf8');
        this.logger.debug(
          `Unzipper fallback extraction successful: ${result.length} characters`,
        );
        return result;
      } catch (err) {
        this.logger.warn(`Unzipper failed: ${err.message}`);
        this.logger.debug(`Unzipper error stack: ${err.stack}`);
        // As a last resort, if signature says gzip, attempt gzip again
        if (looksLikeGzip) {
          this.logger.debug('Attempting final GZIP fallback');
          try {
            const result = this.decompressGzipToString(fileBuffer);
            this.logger.debug(
              `GZIP fallback successful: ${result.length} characters`,
            );
            return result;
          } catch (gzipErr) {
            this.logger.debug(`GZIP fallback failed: ${gzipErr.message}`);
          }
        }
        throw new BadRequestException('Failed to read ZIP archive');
      }
    }

    // Unknown: last attempt using signatures
    if (looksLikeGzip) {
      try {
        return this.decompressGzipToString(fileBuffer);
      } catch (e) {
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
      } catch (e) {
        throw new BadRequestException('Failed to read ZIP archive');
      }
    }

    throw new BadRequestException(`Unsupported file type: ${fileType}`);
  }

  private isZipBuffer(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;
    const a = buffer[0] === 0x50 && buffer[1] === 0x4b; // 'PK'
    return a;
  }

  private isGzipBuffer(buffer: Buffer): boolean {
    if (buffer.length < 2) return false;
    return buffer[0] === 0x1f && buffer[1] === 0x8b;
  }

  private decompressGzipToString(buffer: Buffer): string {
    try {
      const decompressed = zlib.gunzipSync(buffer);
      return decompressed.toString('utf8');
    } catch (err) {
      const inflated = zlib.inflateSync(buffer);
      return inflated.toString('utf8');
    }
  }

  async getDomains(): Promise<string[]> {
    // Get domains from reports (envelope to)
    const reportDomains = await this.dmarcReportRepository
      .createQueryBuilder('report')
      .select('DISTINCT report.domain', 'domain')
      .where('report.domain IS NOT NULL')
      .getRawMany();

    // Get domains from records (header from)
    const headerFromDomains = await this.dmarcRecordRepository
      .createQueryBuilder('record')
      .select('DISTINCT record.headerFrom', 'domain')
      .where('record.headerFrom IS NOT NULL')
      .getRawMany();

    // Combine and deduplicate
    const allDomains = new Set<string>();
    reportDomains.forEach((r) => allDomains.add(r.domain));
    headerFromDomains.forEach((r) => allDomains.add(r.domain));

    return Array.from(allDomains).sort();
  }

  async getReportDomains(): Promise<string[]> {
    // Get only domains from reports (envelope to) - these are the domains that reports are generated for
    const reportDomains = await this.dmarcReportRepository
      .createQueryBuilder('report')
      .select('DISTINCT report.domain', 'domain')
      .where('report.domain IS NOT NULL')
      .orderBy('domain', 'ASC')
      .getRawMany();

    return reportDomains.map((r) => r.domain).filter(Boolean);
  }

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
    const { domain, from, to, limit = 10 } = params;

    let query = this.dmarcRecordRepository
      .createQueryBuilder('record')
      .leftJoin('record.report', 'report')
      .select([
        'record.geoCountry as country',
        'record.geoCountryName as countryName',
        'SUM(record.count) as count',
        // DMARC passes if either DKIM or SPF passes (from policy_evaluated)
        "SUM(CASE WHEN (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as dmarcPassCount",
        "SUM(CASE WHEN record.dmarcDkim = 'pass' THEN record.count ELSE 0 END) as dkimPassCount",
        "SUM(CASE WHEN record.dmarcSpf = 'pass' THEN record.count ELSE 0 END) as spfPassCount",
      ])
      .where('record.geoCountry IS NOT NULL')
      .groupBy('record.geoCountry, record.geoCountryName')
      .orderBy('count', 'DESC')
      .limit(limit);

    if (domain) {
      query = query.andWhere('record.headerFrom ILIKE :domain', {
        domain: `%${domain}%`,
      });
    }

    if (from) {
      query = query.andWhere('report.beginDate >= :from', { from });
    }

    if (to) {
      query = query.andWhere('report.endDate <= :to', { to });
    }

    const result = await query.getRawMany();
    return result.map((r) => ({
      country: r.country,
      countryName: r.countryname || r.country,
      count: parseInt(r.count, 10),
      dmarcPassCount: parseInt(r.dmarcpasscount, 10),
      dkimPassCount: parseInt(r.dkimpasscount, 10),
      spfPassCount: parseInt(r.spfpasscount, 10),
    }));
  }

  async getDomainsWithDnsIssues(params: {
    domain?: string;
    limit?: number;
  }): Promise<
    Array<{
      domain: string;
      severity: 'good' | 'warning' | 'critical';
      summary: string;
      recommendations: string[];
      dmarc: {
        exists: boolean;
        policy?: string;
        issues: string[];
      };
      spf: {
        exists: boolean;
        issues: string[];
      };
      dkim: {
        foundSelectors: number;
        issues: string[];
      };
    }>
  > {
    const { domain, limit = 10 } = params;

    // Get unique domains from our DMARC records (domains we're actually receiving mail for)
    const qb = this.dmarcRecordRepository
      .createQueryBuilder('rec')
      .leftJoin('rec.report', 'rep')
      .select([
        'DISTINCT rec.headerFrom as domain',
        'SUM(rec.count) as emailVolume',
      ])
      .where('rec.headerFrom IS NOT NULL')
      .groupBy('rec.headerFrom')
      .orderBy('emailVolume', 'DESC')
      .limit(limit * 2); // Get more domains to filter after DNS validation

    if (domain) {
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    }

    const domainResults = await qb.getRawMany();
    const domains = domainResults
      .map((r) => r.domain)
      .filter((d) => d && d.length > 0);

    if (domains.length === 0) {
      return [];
    }

    // Import DNS validation service dynamically to avoid circular dependencies
    const { DnsValidationService } = await import(
      './services/dns-validation.service'
    );
    const dnsValidator = new DnsValidationService();

    // Validate DNS records for each domain
    const validationResults = await dnsValidator.validateMultipleDomains(
      domains.slice(0, limit),
    );

    // Filter to only show domains with issues and format for frontend
    return validationResults
      .filter((result) => result.overall.severity !== 'good')
      .map((result) => ({
        domain: result.domain,
        severity: result.overall.severity,
        summary: result.overall.summary,
        recommendations: result.overall.recommendations,
        dmarc: {
          exists: result.dmarc.exists,
          policy: result.dmarc.policy,
          issues: result.dmarc.issues,
        },
        spf: {
          exists: result.spf.exists,
          issues: result.spf.issues,
        },
        dkim: {
          foundSelectors: result.dkim.foundSelectors.length,
          issues: result.dkim.issues,
        },
      }));
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
    const { domain, from, to, page, pageSize } = params;

    let baseQuery = this.dmarcRecordRepository
      .createQueryBuilder('record')
      .leftJoin('record.report', 'report')
      .where('record.geoCountry IS NOT NULL');

    if (domain) {
      baseQuery = baseQuery.andWhere('record.headerFrom ILIKE :domain', {
        domain: `%${domain}%`,
      });
    }

    if (from) {
      baseQuery = baseQuery.andWhere('report.beginDate >= :from', { from });
    }

    if (to) {
      baseQuery = baseQuery.andWhere('report.endDate <= :to', { to });
    }

    // Get total count of unique countries
    const totalQuery = baseQuery
      .clone()
      .select('COUNT(DISTINCT record.geoCountry) as total');

    const totalResult = await totalQuery.getRawOne();
    const total = parseInt(totalResult.total, 10);

    // Get paginated data
    const dataQuery = baseQuery
      .select([
        'record.geoCountry as country',
        'record.geoCountryName as countryName',
        'SUM(record.count) as count',
        // DMARC passes if either DKIM or SPF passes (from policy_evaluated)
        "SUM(CASE WHEN (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as dmarcPassCount",
        "SUM(CASE WHEN record.dmarcDkim = 'pass' THEN record.count ELSE 0 END) as dkimPassCount",
        "SUM(CASE WHEN record.dmarcSpf = 'pass' THEN record.count ELSE 0 END) as spfPassCount",
      ])
      .groupBy('record.geoCountry, record.geoCountryName')
      .orderBy('count', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    const result = await dataQuery.getRawMany();
    const data = result.map((r) => ({
      country: r.country,
      countryName: r.countryname || r.country,
      count: parseInt(r.count, 10),
      dmarcPassCount: parseInt(r.dmarcpasscount, 10),
      dkimPassCount: parseInt(r.dkimpasscount, 10),
      spfPassCount: parseInt(r.spfpasscount, 10),
    }));

    return { data, total };
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
    const { domain, from, to } = params;

    let query = this.dmarcRecordRepository
      .createQueryBuilder('record')
      .leftJoin('record.report', 'report')
      .select([
        'record.geoLatitude as latitude',
        'record.geoLongitude as longitude',
        'SUM(record.count) as count',
        // DMARC passes if either DKIM or SPF passes (from policy_evaluated)
        "SUM(CASE WHEN (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as passCount",
        "SUM(CASE WHEN NOT (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as failCount",
      ])
      .where(
        'record.geoLatitude IS NOT NULL AND record.geoLongitude IS NOT NULL',
      )
      .groupBy('record.geoLatitude, record.geoLongitude')
      .orderBy('count', 'DESC');

    if (domain) {
      query = query.andWhere('record.headerFrom ILIKE :domain', {
        domain: `%${domain}%`,
      });
    }

    if (from) {
      query = query.andWhere('report.beginDate >= :from', { from });
    }

    if (to) {
      query = query.andWhere('report.endDate <= :to', { to });
    }

    const result = await query.getRawMany();
    return result.map((r) => ({
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      count: parseInt(r.count, 10),
      passCount: parseInt(r.passcount, 10),
      failCount: parseInt(r.failcount, 10),
    }));
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
    const { domain, from, to, page = 1, pageSize = 10 } = params;

    let baseQuery = this.dmarcRecordRepository
      .createQueryBuilder('record')
      .leftJoin('record.report', 'report');

    if (domain) {
      baseQuery = baseQuery.where('record.headerFrom ILIKE :domain', {
        domain: `%${domain}%`,
      });
    }

    if (from) {
      baseQuery = baseQuery.andWhere('report.beginDate >= :from', { from });
    }

    if (to) {
      baseQuery = baseQuery.andWhere('report.endDate <= :to', { to });
    }

    // Get total count
    const totalQuery = baseQuery.select(
      'COUNT(DISTINCT record.sourceIp)',
      'total',
    );
    const totalResult = await totalQuery.getRawOne();
    const total = parseInt(totalResult.total, 10);

    // Get paginated data
    const dataQuery = baseQuery
      .select([
        'record.sourceIp as sourceIp',
        'record.geoCountry as country',
        'record.geoCountryName as countryName',
        'record.geoCity as city',
        'record.geoLatitude as latitude',
        'record.geoLongitude as longitude',
        'SUM(record.count) as count',
        // DMARC passes if either DKIM or SPF passes (from policy_evaluated)
        "SUM(CASE WHEN (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as passCount",
        "SUM(CASE WHEN NOT (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as failCount",
        "SUM(CASE WHEN record.dmarcDkim = 'pass' THEN record.count ELSE 0 END) as dkimPassCount",
        "SUM(CASE WHEN record.dmarcSpf = 'pass' THEN record.count ELSE 0 END) as spfPassCount",
      ])
      .groupBy(
        'record.sourceIp, record.geoCountry, record.geoCountryName, record.geoCity, record.geoLatitude, record.geoLongitude',
      )
      .orderBy('count', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    const result = await dataQuery.getRawMany();

    const data = result.map((r) => ({
      sourceIp: r.sourceip,
      count: parseInt(r.count, 10),
      passCount: parseInt(r.passcount, 10),
      failCount: parseInt(r.failcount, 10),
      dkimPassCount: parseInt(r.dkimpasscount, 10),
      spfPassCount: parseInt(r.spfpasscount, 10),
      country: r.country || undefined,
      countryName: r.countryname || undefined,
      city: r.city || undefined,
      latitude: r.latitude ? parseFloat(r.latitude) : undefined,
      longitude: r.longitude ? parseFloat(r.longitude) : undefined,
    }));

    return {
      data,
      total,
      page,
      pageSize,
    };
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
    const { domain, from, to, page, pageSize } = params;

    let baseQuery = this.dmarcRecordRepository
      .createQueryBuilder('record')
      .leftJoin('record.report', 'report')
      .where('record.headerFrom IS NOT NULL');

    if (domain) {
      baseQuery = baseQuery.andWhere('record.headerFrom ILIKE :domain', {
        domain: `%${domain}%`,
      });
    }

    if (from) {
      baseQuery = baseQuery.andWhere('report.beginDate >= :from', { from });
    }

    if (to) {
      baseQuery = baseQuery.andWhere('report.endDate <= :to', { to });
    }

    // Total distinct headerFrom count
    const totalQuery = baseQuery
      .clone()
      .select('COUNT(DISTINCT record.headerFrom) as total');
    const totalResult = await totalQuery.getRawOne();
    const total = parseInt(totalResult.total, 10) || 0;

    // Paginated data
    const dataQuery = baseQuery
      .select([
        'record.headerFrom as headerFrom',
        'SUM(record.count) as count',
        // DMARC passes if either DKIM or SPF passes (from policy_evaluated)
        "SUM(CASE WHEN (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as dmarcPassCount",
        "SUM(CASE WHEN record.dmarcDkim = 'pass' THEN record.count ELSE 0 END) as dkimPassCount",
        "SUM(CASE WHEN record.dmarcSpf = 'pass' THEN record.count ELSE 0 END) as spfPassCount",
      ])
      .groupBy('record.headerFrom')
      .orderBy('count', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    const result = await dataQuery.getRawMany();

    const data = result.map((r) => ({
      headerFrom: r.headerfrom,
      count: parseInt(r.count, 10),
      dmarcPassCount: parseInt(r.dmarcpasscount, 10),
      dkimPassCount: parseInt(r.dkimpasscount, 10),
      spfPassCount: parseInt(r.spfpasscount, 10),
    }));

    return { data, total };
  }
}
