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
  isForwarded?: boolean | null;
  forwardReason?: string | null;
  dkimResults: DkimResult[];
  spfResults: SpfResult[];
  policyOverrideReasons: PolicyOverrideReason[];
}

export interface ThirdPartySender {
  id: string;
  name: string;
  description?: string;
  dkimPattern?: string;
  spfPattern?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateThirdPartySenderDto {
  name: string;
  description?: string;
  dkimPattern?: string;
  spfPattern?: string;
  enabled?: boolean;
}

export interface UpdateThirdPartySenderDto {
  name?: string;
  description?: string;
  dkimPattern?: string;
  spfPattern?: string;
  enabled?: boolean;
}

export interface ReprocessingJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalRecords?: number;
  processedRecords: number;
  forwardedCount: number;
  notForwardedCount: number;
  unknownCount: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  dateFrom?: string;
  dateTo?: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  elapsedSeconds?: number | null;
  isFinished?: boolean;
}

export interface Domain {
  id: string;
  domain: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDomainDto {
  domain: string;
  notes?: string;
}

export interface UpdateDomainDto {
  notes?: string | null;
}

export interface DomainStatistics {
  id?: string;
  domain: string;
  isManaged: boolean;
  totalMessages: number;
  passedMessages: number;
  failedMessages: number;
  dmarcPassRate: number;
  spfPassRate: number;
  dkimPassRate: number;
  uniqueSources: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
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
    orgName?: string | string[];
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
    isForwarded?: boolean | null;
    sort?: string;
    order?: 'asc' | 'desc';
  }) {
    let hp = new HttpParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === '') {
        return;
      }
      // Special handling for null values (e.g., isForwarded: null means "unknown")
      if (v === null) {
        hp = hp.set(k, 'null');
        return;
      }
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
    opts?: { from?: string; to?: string }
  ) {
    let hp = new HttpParams().set('field', field);
    if (opts?.from) {
      hp = hp.set('from', opts.from);
    }
    if (opts?.to) {
      hp = hp.set('to', opts.to);
    }
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

  // Third-Party Senders API
  getThirdPartySenders() {
    return this.http.get<ThirdPartySender[]>(`${this.apiBase}/settings/third-party-senders`);
  }

  getThirdPartySender(id: string) {
    return this.http.get<ThirdPartySender>(`${this.apiBase}/settings/third-party-senders/${id}`);
  }

  createThirdPartySender(dto: CreateThirdPartySenderDto) {
    return this.http.post<ThirdPartySender>(`${this.apiBase}/settings/third-party-senders`, dto);
  }

  updateThirdPartySender(id: string, dto: UpdateThirdPartySenderDto) {
    return this.http.put<ThirdPartySender>(`${this.apiBase}/settings/third-party-senders/${id}`, dto);
  }

  deleteThirdPartySender(id: string) {
    return this.http.delete<void>(`${this.apiBase}/settings/third-party-senders/${id}`);
  }

  // Reprocessing API
  startReprocessing(dateFrom?: string, dateTo?: string) {
    return this.http.post<ReprocessingJob>(`${this.apiBase}/reprocessing/start`, { dateFrom, dateTo });
  }

  cancelReprocessing(jobId: string) {
    return this.http.post<ReprocessingJob>(`${this.apiBase}/reprocessing/cancel/${jobId}`, {});
  }

  getCurrentReprocessingJob() {
    return this.http.get<ReprocessingJob | null>(`${this.apiBase}/reprocessing/current`);
  }

  getReprocessingJobs() {
    return this.http.get<ReprocessingJob[]>(`${this.apiBase}/reprocessing/jobs`);
  }

  getReprocessingJob(id: string) {
    return this.http.get<ReprocessingJob>(`${this.apiBase}/reprocessing/jobs/${id}`);
  }

  // Domains API
  getDomainsList() {
    return this.http.get<Domain[]>(`${this.apiBase}/domains`);
  }

  getDomainStatistics(daysBack: number = 30) {
    let hp = new HttpParams().set('daysBack', String(daysBack));
    return this.http.get<DomainStatistics[]>(`${this.apiBase}/domains/statistics`, { params: hp });
  }

  getDomainById(id: string) {
    return this.http.get<Domain>(`${this.apiBase}/domains/${id}`);
  }

  createDomain(dto: CreateDomainDto) {
    return this.http.post<Domain>(`${this.apiBase}/domains`, dto);
  }

  updateDomain(id: string, dto: UpdateDomainDto) {
    return this.http.put<Domain>(`${this.apiBase}/domains/${id}`, dto);
  }

  deleteDomain(id: string) {
    return this.http.delete<{ message: string }>(`${this.apiBase}/domains/${id}`);
  }
}
