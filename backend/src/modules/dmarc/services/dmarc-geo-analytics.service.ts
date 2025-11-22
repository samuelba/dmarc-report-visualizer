import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DmarcRecord } from '../entities/dmarc-record.entity';

// Raw query result interfaces (column aliases are normalized to lowercase keys by TypeORM)
interface RawTopCountryRow {
  country: string;
  count: string; // aggregated SUM(count)
  dmarcpasscount: string; // SUM(...) as dmarcPassCount
  dkimpasscount: string;
  spfpasscount: string;
}

interface RawTotalRow {
  total: string;
}

interface RawGeoHeatmapRow {
  country: string;
  latitude: string | null;
  longitude: string | null;
  count: string;
  passcount: string;
  failcount: string;
}

interface RawTopIpRow {
  sourceip: string;
  country: string | null;
  city: string | null;
  latitude: string | null;
  longitude: string | null;
  isp: string | null;
  org: string | null;
  count: string;
  passcount: string;
  failcount: string;
  dkimpasscount: string;
  spfpasscount: string;
}

interface RawHeaderFromRow {
  headerfrom: string;
  count: string;
  dmarcpasscount: string;
  dkimpasscount: string;
  spfpasscount: string;
}

@Injectable()
export class DmarcGeoAnalyticsService {
  constructor(
    @InjectRepository(DmarcRecord)
    private dmarcRecordRepository: Repository<DmarcRecord>,
  ) {}

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
    const { domain, from, to, limit = 10 } = params;

    let query = this.dmarcRecordRepository
      .createQueryBuilder('record')
      .leftJoin('record.report', 'report')
      .select([
        'record.geoCountry as country',
        'SUM(record.count) as count',
        // DMARC passes if either DKIM or SPF passes (from policy_evaluated)
        "SUM(CASE WHEN (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as dmarcPassCount",
        "SUM(CASE WHEN record.dmarcDkim = 'pass' THEN record.count ELSE 0 END) as dkimPassCount",
        "SUM(CASE WHEN record.dmarcSpf = 'pass' THEN record.count ELSE 0 END) as spfPassCount",
      ])
      .where('record.geoCountry IS NOT NULL')
      .groupBy('record.geoCountry')
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

    const result = await query.getRawMany<RawTopCountryRow>();
    return result.map((r) => ({
      country: r.country,
      count: parseInt(r.count, 10),
      dmarcPassCount: parseInt(r.dmarcpasscount, 10),
      dkimPassCount: parseInt(r.dkimpasscount, 10),
      spfPassCount: parseInt(r.spfpasscount, 10),
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

    const totalResult = await totalQuery.getRawOne<RawTotalRow>();
    const total = totalResult ? parseInt(totalResult.total, 10) : 0;

    // Get paginated data
    const dataQuery = baseQuery
      .select([
        'record.geoCountry as country',
        'SUM(record.count) as count',
        // DMARC passes if either DKIM or SPF passes (from policy_evaluated)
        "SUM(CASE WHEN (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as dmarcPassCount",
        "SUM(CASE WHEN record.dmarcDkim = 'pass' THEN record.count ELSE 0 END) as dkimPassCount",
        "SUM(CASE WHEN record.dmarcSpf = 'pass' THEN record.count ELSE 0 END) as spfPassCount",
      ])
      .groupBy('record.geoCountry')
      .orderBy('count', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    const result = await dataQuery.getRawMany<RawTopCountryRow>();
    const data = result.map((r) => ({
      country: r.country,
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
      country: string;
    }>
  > {
    const { domain, from, to } = params;

    let query = this.dmarcRecordRepository
      .createQueryBuilder('record')
      .leftJoin('record.report', 'report')
      .select([
        'record.geoCountry as country',
        // Use average coordinates for the country center
        'AVG(record.geoLatitude) as latitude',
        'AVG(record.geoLongitude) as longitude',
        'SUM(record.count) as count',
        // DMARC passes if either DKIM or SPF passes (from policy_evaluated)
        "SUM(CASE WHEN (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as passCount",
        "SUM(CASE WHEN NOT (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as failCount",
      ])
      .where('record.geoCountry IS NOT NULL')
      .groupBy('record.geoCountry')
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

    const result = await query.getRawMany<RawGeoHeatmapRow>();
    return result.map((r) => ({
      country: r.country,
      latitude: r.latitude ? parseFloat(r.latitude) : 0,
      longitude: r.longitude ? parseFloat(r.longitude) : 0,
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
      city?: string;
      latitude?: number;
      longitude?: number;
      isp?: string;
      org?: string;
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
    const totalResult = await totalQuery.getRawOne<RawTotalRow>();
    const total = totalResult ? parseInt(totalResult.total, 10) : 0;

    // Get paginated data
    const dataQuery = baseQuery
      .select([
        'record.sourceIp as sourceIp',
        'record.geoCountry as country',
        'record.geoCity as city',
        'record.geoLatitude as latitude',
        'record.geoLongitude as longitude',
        'record.geoIsp as isp',
        'record.geoOrg as org',
        'SUM(record.count) as count',
        // DMARC passes if either DKIM or SPF passes (from policy_evaluated)
        "SUM(CASE WHEN (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as passCount",
        "SUM(CASE WHEN NOT (record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass') THEN record.count ELSE 0 END) as failCount",
        "SUM(CASE WHEN record.dmarcDkim = 'pass' THEN record.count ELSE 0 END) as dkimPassCount",
        "SUM(CASE WHEN record.dmarcSpf = 'pass' THEN record.count ELSE 0 END) as spfPassCount",
      ])
      .groupBy(
        'record.sourceIp, record.geoCountry, record.geoCity, record.geoLatitude, record.geoLongitude, record.geoIsp, record.geoOrg',
      )
      .orderBy('count', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    const result = await dataQuery.getRawMany<RawTopIpRow>();

    const data = result.map((r) => ({
      sourceIp: r.sourceip,
      count: parseInt(r.count, 10),
      passCount: parseInt(r.passcount, 10),
      failCount: parseInt(r.failcount, 10),
      dkimPassCount: parseInt(r.dkimpasscount, 10),
      spfPassCount: parseInt(r.spfpasscount, 10),
      country: r.country ?? undefined,
      city: r.city ?? undefined,
      latitude: r.latitude ? parseFloat(r.latitude) : undefined,
      longitude: r.longitude ? parseFloat(r.longitude) : undefined,
      isp: r.isp ?? undefined,
      org: r.org ?? undefined,
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
    const totalResult = await totalQuery.getRawOne<RawTotalRow>();
    const total = totalResult ? parseInt(totalResult.total, 10) || 0 : 0;

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

    const result = await dataQuery.getRawMany<RawHeaderFromRow>();

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
