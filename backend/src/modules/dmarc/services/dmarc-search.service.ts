import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DmarcReport } from '../entities/dmarc-report.entity';
import { DmarcRecord } from '../entities/dmarc-record.entity';
import { DkimResult } from '../entities/dkim-result.entity';
import { SpfResult } from '../entities/spf-result.entity';

export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class DmarcSearchService {
  constructor(
    @InjectRepository(DmarcReport)
    private dmarcReportRepository: Repository<DmarcReport>,
    @InjectRepository(DmarcRecord)
    private dmarcRecordRepository: Repository<DmarcRecord>,
    @InjectRepository(DkimResult)
    private dkimResultRepository: Repository<DkimResult>,
    @InjectRepository(SpfResult)
    private spfResultRepository: Repository<SpfResult>,
  ) {}

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
      qb.andWhere('rep.domain = ANY(:domains)', {
        domains: arr,
      });
    }
    if (orgName) {
      const arr = Array.isArray(orgName) ? orgName : [orgName];
      qb.andWhere('rep.orgName = ANY(:orgNames)', {
        orgNames: arr,
      });
    }
    if (from) {
      qb.andWhere('rep.beginDate >= :from', { from });
    }
    if (to) {
      qb.andWhere('rep.beginDate <= :to', { to });
    }
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
      qb.andWhere('rec.envelopeTo = ANY(:etos)', {
        etos: arr,
      });
    }
    if (headerFrom) {
      const arr = Array.isArray(headerFrom) ? headerFrom : [headerFrom];
      qb.andWhere('rec.headerFrom = ANY(:hfs)', {
        hfs: arr,
      });
    }
    if (envelopeFrom) {
      const arr = Array.isArray(envelopeFrom) ? envelopeFrom : [envelopeFrom];
      qb.andWhere('rec.envelopeFrom = ANY(:efs)', {
        efs: arr,
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
        AND dk_filter.domain = ANY(:dkdoms)
      )`,
        {
          dkdoms: arr,
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
        AND sf_filter.domain = ANY(:sfdoms)
      )`,
        {
          sfdoms: arr,
        },
      );
    }
    if (country) {
      const arr = Array.isArray(country) ? country : [country];
      qb.andWhere('rec.geoCountry = ANY(:ctys)', {
        ctys: arr,
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
        LOWER(rec.geoIsp) LIKE :searchTerm OR
        LOWER(rec.geoOrg) LIKE :searchTerm OR
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
      orgName: 'rep.orgName',
    };
    const col =
      params.sort && sortsMap[params.sort]
        ? sortsMap[params.sort]
        : 'rep.beginDate';
    const dir = (params.order || 'desc').toUpperCase() as 'ASC' | 'DESC';
    // Primary sort by selected column, secondary sort by ID for consistent ordering
    qb.orderBy(col, dir)
      .addOrderBy('rec.id', 'DESC')
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
      if (from) {
        qb.andWhere('rep.beginDate >= :from', { from });
      }
      if (to) {
        qb.andWhere('rep.beginDate <= :to', { to });
      }
      const rows = await qb.orderBy('v', 'ASC').getRawMany();
      return rows.map((r) => r.v).filter(Boolean);
    }
    if (field === 'orgName') {
      const qb = this.dmarcReportRepository
        .createQueryBuilder('rep')
        .select('DISTINCT rep.orgName', 'v')
        .where('rep.orgName IS NOT NULL');
      if (from) {
        qb.andWhere('rep.beginDate >= :from', { from });
      }
      if (to) {
        qb.andWhere('rep.beginDate <= :to', { to });
      }
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
      if (from) {
        qb.andWhere('rep.beginDate >= :from', { from });
      }
      if (to) {
        qb.andWhere('rep.beginDate <= :to', { to });
      }
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
      if (from) {
        qb.andWhere('rep.beginDate >= :from', { from });
      }
      if (to) {
        qb.andWhere('rep.beginDate <= :to', { to });
      }
      const rows = await qb.orderBy('v', 'ASC').getRawMany();
      return rows.map((r) => r.v).filter(Boolean);
    }
    type DistinctField =
      | 'sourceIp'
      | 'envelopeTo'
      | 'envelopeFrom'
      | 'headerFrom'
      | 'country';
    const map: Record<DistinctField, string> = {
      sourceIp: 'rec.sourceIp',
      envelopeTo: 'rec.envelopeTo',
      envelopeFrom: 'rec.envelopeFrom',
      headerFrom: 'rec.headerFrom',
      country: 'rec.geoCountry',
    };
    const col = map[field as DistinctField];
    const qb = this.dmarcRecordRepository
      .createQueryBuilder('rec')
      .leftJoin('rec.report', 'rep')
      .select(`DISTINCT ${col}`, 'v')
      .where(`${col} IS NOT NULL`);
    if (from) {
      qb.andWhere('rep.beginDate >= :from', { from });
    }
    if (to) {
      qb.andWhere('rep.beginDate <= :to', { to });
    }
    const rows = await qb
      .orderBy('v', 'ASC')
      .getRawMany<{ v: string | null }>();
    return rows.map((r) => r.v).filter((v): v is string => Boolean(v));
  }

  async getDomains(): Promise<string[]> {
    // Get domains from reports (envelope to)
    const reportDomains = await this.dmarcReportRepository
      .createQueryBuilder('report')
      .select('DISTINCT report.domain', 'domain')
      .where('report.domain IS NOT NULL')
      .getRawMany<{ domain: string | null }>();

    // Get domains from records (header from)
    const headerFromDomains = await this.dmarcRecordRepository
      .createQueryBuilder('record')
      .select('DISTINCT record.headerFrom', 'domain')
      .where('record.headerFrom IS NOT NULL')
      .getRawMany<{ domain: string | null }>();

    // Combine and deduplicate
    const allDomains = new Set<string>();
    reportDomains.forEach((r) => {
      if (r.domain) {
        allDomains.add(r.domain);
      }
    });
    headerFromDomains.forEach((r) => {
      if (r.domain) {
        allDomains.add(r.domain);
      }
    });

    return Array.from(allDomains).sort();
  }

  async getReportDomains(): Promise<string[]> {
    // Get only domains from reports (envelope to) - these are the domains that reports are generated for
    const reportDomains = await this.dmarcReportRepository
      .createQueryBuilder('report')
      .select('DISTINCT report.domain', 'domain')
      .where('report.domain IS NOT NULL')
      .orderBy('domain', 'ASC')
      .getRawMany<{ domain: string | null }>();

    return reportDomains
      .map((r) => r.domain)
      .filter((d): d is string => Boolean(d));
  }
}
