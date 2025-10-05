import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DkimResult {
  id: string;
  domain?: string;
  selector?: string;
  result?: 'none' | 'pass' | 'fail' | 'policy' | 'neutral' | 'temperror' | 'permerror';
  humanResult?: string;
}

export interface SpfResult {
  id: string;
  domain?: string;
  result?: 'none' | 'neutral' | 'pass' | 'fail' | 'softfail' | 'temperror' | 'permerror';
}

export interface PolicyOverrideReason {
  id: string;
  type?: 'forwarded' | 'sampled_out' | 'trusted_forwarder' | 'mailing_list' | 'local_policy' | 'other';
  comment?: string;
}

export interface DmarcRecord {
  id: string;
  sourceIp?: string;
  count?: number;
  disposition?: 'none' | 'quarantine' | 'reject';
  dmarcDkim?: 'pass' | 'fail';
  dmarcSpf?: 'pass' | 'fail';
  envelopeTo?: string;
  envelopeFrom?: string;
  headerFrom?: string;
  reasonType?: string;
  reasonComment?: string;
  dkimResults: DkimResult[];
  spfResults: SpfResult[];
  policyOverrideReasons: PolicyOverrideReason[];
}

export interface DmarcReport {
  id: string;
  reportId?: string;
  orgName?: string;
  email?: string;
  domain?: string;
  policy?: any;
  records: DmarcRecord[];
  beginDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = '/api';

  listReports(params: {
    domain?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
    order?: string;
  }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<PagedResult<DmarcReport>>(`${this.apiBase}/dmarc-reports/list`, { params: hp });
  }

  summary(params: { domain?: string; from?: string; to?: string }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<{ totalReports: number; uniqueDomains: number; uniqueReportIds: number }>(
      `${this.apiBase}/dmarc-reports/stats/summary`,
      { params: hp }
    );
  }

  timeseries(params: { domain?: string; from?: string; to?: string; interval?: 'day' | 'week' }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<Array<{ date: string; count: number }>>(`${this.apiBase}/dmarc-reports/stats/timeseries`, {
      params: hp,
    });
  }

  topSources(params: { domain?: string; from?: string; to?: string; limit?: number }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<Array<{ source: string; count: number }>>(`${this.apiBase}/dmarc-reports/stats/top-sources`, {
      params: hp,
    });
  }

  upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<DmarcReport>(`${this.apiBase}/dmarc-reports/upload`, form);
  }

  authSummary(params: { domain?: string; from?: string; to?: string }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<{ total: number; dkimPass: number; spfPass: number; dmarcPass: number; enforcement: number }>(
      `${this.apiBase}/dmarc-reports/stats/auth-summary`,
      { params: hp }
    );
  }

  authBreakdown(params: { domain?: string; from?: string; to?: string }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<{
      dkim: { pass: number; fail: number; missing: number };
      spf: { pass: number; fail: number; missing: number };
    }>(`${this.apiBase}/dmarc-reports/stats/auth-breakdown`, { params: hp });
  }

  authPassRateTimeseries(params: { domain?: string; from?: string; to?: string; interval?: 'day' | 'week' }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<
      Array<{
        date: string;
        dkimPassRate: number;
        spfPassRate: number;
        totalCount: number;
        dkimPassCount: number;
        spfPassCount: number;
      }>
    >(`${this.apiBase}/dmarc-reports/stats/auth-pass-rate-timeseries`, { params: hp });
  }

  dispositionTimeseries(params: { domain?: string; from?: string; to?: string; interval?: 'day' | 'week' }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<Array<{ date: string; none: number; quarantine: number; reject: number; total: number }>>(
      `${this.apiBase}/dmarc-reports/stats/disposition-timeseries`,
      { params: hp }
    );
  }

  authMatrix(params: { domain?: string; from?: string; to?: string }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<{
      dkimPass_spfPass: number;
      dkimPass_spfFail: number;
      dkimFail_spfPass: number;
      dkimFail_spfFail: number;
    }>(`${this.apiBase}/dmarc-reports/stats/auth-matrix`, { params: hp });
  }

  topIps(params: { domain?: string; from?: string; to?: string; limit?: number }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<Array<{ ip: string; total: number; pass: number; fail: number; lastSeen: string }>>(
      `${this.apiBase}/dmarc-reports/stats/top-ips`,
      { params: hp }
    );
  }

  newIps(params: { domain?: string; from?: string; to?: string; limit?: number }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<Array<{ ip: string; firstSeen: string; count: number }>>(
      `${this.apiBase}/dmarc-reports/stats/new-ips`,
      { params: hp }
    );
  }

  getDomains() {
    return this.http.get<{ domains: string[] }>(`${this.apiBase}/dmarc-reports/domains`);
  }

  getReportDomains() {
    return this.http.get<{ domains: string[] }>(`${this.apiBase}/dmarc-reports/report-domains`);
  }

  getReportXml(id: string) {
    return this.http.get(`${this.apiBase}/dmarc-reports/report/${id}/xml`, { responseType: 'text' });
  }

  getRecordXml(id: string) {
    return this.http.get(`${this.apiBase}/dmarc-reports/record/${id}/xml`, { responseType: 'text' });
  }

  getRecordById(id: string) {
    return this.http.get<DmarcRecord>(`${this.apiBase}/dmarc-reports/record/${id}`);
  }

  findOne(id: string) {
    return this.http.get<DmarcReport>(`${this.apiBase}/dmarc-reports/report/${id}`);
  }

  searchRecords(params: {
    page?: number;
    pageSize?: number;
    domain?: string | string[];
    from?: string;
    to?: string;
    disposition?: 'none' | 'quarantine' | 'reject' | Array<'none' | 'quarantine' | 'reject'>;
    dkim?: 'pass' | 'fail' | 'none' | Array<'pass' | 'fail' | 'none'>;
    spf?: 'pass' | 'fail' | 'none' | Array<'pass' | 'fail' | 'none'>;
    sourceIp?: string | string[];
    envelopeTo?: string | string[];
    envelopeFrom?: string | string[];
    headerFrom?: string | string[];
    dkimDomain?: string | string[];
    spfDomain?: string | string[];
    country?: string | string[];
    contains?: string;
    sort?: string;
    order?: 'asc' | 'desc';
  }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      if (Array.isArray(v)) {
        v.forEach((item) => {
          if (item !== undefined && item !== null && item !== '') {
            hp = hp.append(k, String(item));
          }
        });
      } else {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<PagedResult<DmarcRecord>>(`${this.apiBase}/dmarc-reports/records/search`, { params: hp });
  }

  getRecordDistinct(
    field: 'domain' | 'sourceIp' | 'envelopeTo' | 'envelopeFrom' | 'headerFrom' | 'dkimDomain' | 'spfDomain' | 'country',
    opts?: { from?: string; to?: string }
  ) {
    let hp = new HttpParams().set('field', field);
    if (opts?.from) hp = hp.set('from', opts.from);
    if (opts?.to) hp = hp.set('to', opts.to);
    return this.http.get<string[]>(`${this.apiBase}/dmarc-reports/records/distinct`, {
      params: hp,
    });
  }

  getTopCountries(params: { domain?: string; from?: string; to?: string; limit?: number }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<
      Array<{
        country: string;
        countryName: string;
        count: number;
        dmarcPassCount: number;
        dkimPassCount: number;
        spfPassCount: number;
      }>
    >(`${this.apiBase}/dmarc-reports/top-countries`, { params: hp });
  }

  getGeoHeatmap(params: { domain?: string; from?: string; to?: string }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<
      Array<{
        latitude: number;
        longitude: number;
        count: number;
        passCount: number;
        failCount: number;
      }>
    >(`${this.apiBase}/dmarc-reports/geo-heatmap`, { params: hp });
  }

  getTopIpsEnhanced(params: { domain?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<{
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
    }>(`${this.apiBase}/dmarc-reports/top-ips-enhanced`, { params: hp });
  }

  getDomainsWithDnsIssues(params: { domain?: string; limit?: number }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<
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
    >(`${this.apiBase}/dmarc-reports/domains-with-dns-issues`, { params: hp });
  }

  getTopHeaderFrom(params: { domain?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        hp = hp.set(k, String(v));
      }
    });
    return this.http.get<{
      data: Array<{
        headerFrom: string;
        count: number;
        dmarcPassCount: number;
        dkimPassCount: number;
        spfPassCount: number;
      }>;
      total: number;
      page: number;
      pageSize: number;
    }>(`${this.apiBase}/dmarc-reports/top-header-from`, { params: hp });
  }
}
