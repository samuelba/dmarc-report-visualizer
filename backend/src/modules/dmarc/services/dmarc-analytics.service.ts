import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DmarcReport } from '../entities/dmarc-report.entity';
import { DmarcRecord } from '../entities/dmarc-record.entity';

@Injectable()
export class DmarcAnalyticsService {
  constructor(
    @InjectRepository(DmarcReport)
    private dmarcReportRepository: Repository<DmarcReport>,
    @InjectRepository(DmarcRecord)
    private dmarcRecordRepository: Repository<DmarcRecord>,
  ) {}

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
    const where: any = {};
    if (domain) {
      where.domain = domain;
    }
    if (from || to) {
      where.beginDate = {
        ...(from && { $gte: from }),
        ...(to && { $lte: to }),
      };
    }

    const [_rows, totalReports, uniqueDomains, uniqueReportIds] =
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

      if (from) {
        qb.andWhere('rep.beginDate >= :from', { from });
      }
      if (to) {
        qb.andWhere('rep.beginDate <= :to', { to });
      }

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
      if (from) {
        qb.andWhere('rep.beginDate >= :from', { from });
      }
      if (to) {
        qb.andWhere('rep.beginDate <= :to', { to });
      }

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
    if (domain) {
      qb.andWhere('r.domain ILIKE :domain', { domain: `%${domain}%` });
    }
    if (from) {
      qb.andWhere('r.beginDate >= :from', { from });
    }
    if (to) {
      qb.andWhere('r.beginDate <= :to', { to });
    }

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
    if (domain) {
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    }
    if (from) {
      qb.andWhere('rep.beginDate >= :from', { from });
    }
    if (to) {
      qb.andWhere('rep.beginDate <= :to', { to });
    }

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

    if (domain) {
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    }
    if (from) {
      qb.andWhere('rep.beginDate >= :from', { from });
    }
    if (to) {
      qb.andWhere('rep.beginDate <= :to', { to });
    }

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
    if (domain) {
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    }
    if (from) {
      qb.andWhere('rep.beginDate >= :from', { from });
    }
    if (to) {
      qb.andWhere('rep.beginDate <= :to', { to });
    }

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
    if (domain) {
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    }
    if (from) {
      qb.andWhere('rep.beginDate >= :from', { from });
    }
    if (to) {
      qb.andWhere('rep.beginDate <= :to', { to });
    }

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
    if (domain) {
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    }
    if (from) {
      qb.andWhere('rep.beginDate >= :from', { from });
    }
    if (to) {
      qb.andWhere('rep.beginDate <= :to', { to });
    }

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
    if (domain) {
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    }
    if (from) {
      qb.andWhere('rep.beginDate >= :from', { from });
    }
    if (to) {
      qb.andWhere('rep.beginDate <= :to', { to });
    }

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
    if (domain) {
      qb.andWhere('rec.headerFrom ILIKE :domain', { domain: `%${domain}%` });
    }
    if (from) {
      qb.andWhere('rep.beginDate >= :from', { from });
    }
    if (to) {
      qb.andWhere('rep.beginDate <= :to', { to });
    }

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
}
