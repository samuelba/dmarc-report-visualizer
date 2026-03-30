import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;
  const apiBase = '/api';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- Report endpoints ---
  describe('listReports', () => {
    it('should call list endpoint with params', () => {
      service.listReports({ domain: 'example.com', page: 1, pageSize: 20 }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/list`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('domain')).toBe('example.com');
      expect(req.request.params.get('page')).toBe('1');
      req.flush({ data: [], total: 0, page: 1, pageSize: 20 });
    });

    it('should skip undefined/null/empty params', () => {
      service.listReports({ domain: undefined, from: '', to: undefined }).subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/list`);
      expect(req.request.params.keys().length).toBe(0);
      req.flush({ data: [], total: 0, page: 1, pageSize: 20 });
    });
  });

  describe('summary', () => {
    it('should call summary endpoint', () => {
      service.summary({ domain: 'test.com' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/stats/summary`);
      expect(req.request.params.get('domain')).toBe('test.com');
      req.flush({ totalReports: 5, uniqueDomains: 1, uniqueReportIds: 5 });
    });
  });

  describe('timeseries', () => {
    it('should call timeseries endpoint', () => {
      service.timeseries({ interval: 'day' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/stats/timeseries`);
      expect(req.request.params.get('interval')).toBe('day');
      req.flush([]);
    });
  });

  describe('topSources', () => {
    it('should call top-sources endpoint', () => {
      service.topSources({ limit: 10 }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/stats/top-sources`);
      expect(req.request.params.get('limit')).toBe('10');
      req.flush([]);
    });
  });

  describe('upload', () => {
    it('should POST form data', () => {
      const file = new File(['content'], 'test.xml', { type: 'text/xml' });
      service.upload(file).subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/upload`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBe(true);
      req.flush({});
    });
  });

  describe('authSummary', () => {
    it('should call auth-summary endpoint', () => {
      service.authSummary({}).subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/stats/auth-summary`);
      expect(req.request.method).toBe('GET');
      req.flush({ total: 0, dkimPass: 0, spfPass: 0, dmarcPass: 0, enforcement: 0 });
    });
  });

  describe('authBreakdown', () => {
    it('should call auth-breakdown endpoint', () => {
      service.authBreakdown({ domain: 'd.com' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/stats/auth-breakdown`);
      req.flush({ dkim: { pass: 0, fail: 0, missing: 0 }, spf: { pass: 0, fail: 0, missing: 0 } });
    });
  });

  describe('authPassRateTimeseries', () => {
    it('should call auth-pass-rate-timeseries endpoint', () => {
      service.authPassRateTimeseries({ interval: 'week' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/stats/auth-pass-rate-timeseries`);
      expect(req.request.params.get('interval')).toBe('week');
      req.flush([]);
    });
  });

  describe('dispositionTimeseries', () => {
    it('should call disposition-timeseries endpoint', () => {
      service.dispositionTimeseries({}).subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/stats/disposition-timeseries`);
      req.flush([]);
    });
  });

  describe('authMatrix', () => {
    it('should call auth-matrix endpoint', () => {
      service.authMatrix({}).subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/stats/auth-matrix`);
      req.flush({ dkimPass_spfPass: 0, dkimPass_spfFail: 0, dkimFail_spfPass: 0, dkimFail_spfFail: 0 });
    });
  });

  describe('topIps', () => {
    it('should call top-ips endpoint', () => {
      service.topIps({ limit: 5 }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/stats/top-ips`);
      req.flush([]);
    });
  });

  describe('newIps', () => {
    it('should call new-ips endpoint', () => {
      service.newIps({}).subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/stats/new-ips`);
      req.flush([]);
    });
  });

  describe('getDomains', () => {
    it('should call domains endpoint', () => {
      service.getDomains().subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/domains`);
      req.flush({ domains: ['a.com'] });
    });
  });

  describe('getReportDomains', () => {
    it('should call report-domains endpoint', () => {
      service.getReportDomains().subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/report-domains`);
      req.flush({ domains: [] });
    });
  });

  describe('getReportXml', () => {
    it('should request XML as text', () => {
      service.getReportXml('id-1').subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/report/id-1/xml`);
      expect(req.request.responseType).toBe('text');
      req.flush('<xml/>');
    });
  });

  describe('getRecordXml', () => {
    it('should request record XML as text', () => {
      service.getRecordXml('rec-1').subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/record/rec-1/xml`);
      expect(req.request.responseType).toBe('text');
      req.flush('<xml/>');
    });
  });

  describe('getRecordById', () => {
    it('should fetch single record', () => {
      service.getRecordById('rec-1').subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/record/rec-1`);
      req.flush({ id: 'rec-1', dkimResults: [], spfResults: [], policyOverrideReasons: [] });
    });
  });

  describe('findOne', () => {
    it('should fetch single report', () => {
      service.findOne('rpt-1').subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/report/rpt-1`);
      req.flush({ id: 'rpt-1', records: [] });
    });
  });

  describe('searchRecords', () => {
    it('should pass simple params', () => {
      service.searchRecords({ domain: 'a.com', page: 1, pageSize: 10 }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/records/search`);
      expect(req.request.params.get('domain')).toBe('a.com');
      req.flush({ data: [], total: 0, page: 1, pageSize: 10 });
    });

    it('should handle array params', () => {
      service.searchRecords({ domain: ['a.com', 'b.com'] }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/records/search`);
      expect(req.request.params.getAll('domain')).toEqual(['a.com', 'b.com']);
      req.flush({ data: [], total: 0, page: 1, pageSize: 10 });
    });

    it('should handle null values (isForwarded: null)', () => {
      service.searchRecords({ isForwarded: null }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/records/search`);
      expect(req.request.params.get('isForwarded')).toBe('null');
      req.flush({ data: [], total: 0, page: 1, pageSize: 10 });
    });

    it('should skip empty string params', () => {
      service.searchRecords({ domain: '', contains: '' }).subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/records/search`);
      expect(req.request.params.keys().length).toBe(0);
      req.flush({ data: [], total: 0, page: 1, pageSize: 10 });
    });
  });

  describe('getRecordDistinct', () => {
    it('should pass field and date range', () => {
      service.getRecordDistinct('domain', { from: '2024-01-01', to: '2024-12-31' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/records/distinct`);
      expect(req.request.params.get('field')).toBe('domain');
      expect(req.request.params.get('from')).toBe('2024-01-01');
      req.flush(['a.com', 'b.com']);
    });

    it('should work without date range', () => {
      service.getRecordDistinct('sourceIp').subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/records/distinct`);
      expect(req.request.params.get('field')).toBe('sourceIp');
      expect(req.request.params.has('from')).toBe(false);
      req.flush([]);
    });
  });

  describe('getTopCountries', () => {
    it('should call top-countries endpoint', () => {
      service.getTopCountries({ limit: 10 }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/top-countries`);
      req.flush([]);
    });
  });

  describe('getGeoHeatmap', () => {
    it('should call geo-heatmap endpoint', () => {
      service.getGeoHeatmap({}).subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/geo-heatmap`);
      req.flush([]);
    });
  });

  describe('getTopIpsEnhanced', () => {
    it('should call top-ips-enhanced endpoint', () => {
      service.getTopIpsEnhanced({ page: 1, pageSize: 10 }).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/top-ips-enhanced`);
      req.flush({ data: [], total: 0, page: 1, pageSize: 10 });
    });
  });

  describe('getTopHeaderFrom', () => {
    it('should call top-header-from endpoint', () => {
      service.getTopHeaderFrom({}).subscribe();
      const req = httpMock.expectOne(`${apiBase}/dmarc-reports/top-header-from`);
      req.flush({ data: [], total: 0, page: 1, pageSize: 10 });
    });
  });

  // --- Third-Party Senders ---
  describe('Third-Party Senders', () => {
    it('should list third-party senders', () => {
      service.getThirdPartySenders().subscribe();
      const req = httpMock.expectOne(`${apiBase}/settings/third-party-senders`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('should get single sender', () => {
      service.getThirdPartySender('s1').subscribe();
      const req = httpMock.expectOne(`${apiBase}/settings/third-party-senders/s1`);
      req.flush({ id: 's1', name: 'Test' });
    });

    it('should create third-party sender', () => {
      service.createThirdPartySender({ name: 'New' }).subscribe();
      const req = httpMock.expectOne(`${apiBase}/settings/third-party-senders`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.name).toBe('New');
      req.flush({ id: 's2', name: 'New' });
    });

    it('should update third-party sender', () => {
      service.updateThirdPartySender('s1', { name: 'Updated' }).subscribe();
      const req = httpMock.expectOne(`${apiBase}/settings/third-party-senders/s1`);
      expect(req.request.method).toBe('PUT');
      req.flush({ id: 's1', name: 'Updated' });
    });

    it('should delete third-party sender', () => {
      service.deleteThirdPartySender('s1').subscribe();
      const req = httpMock.expectOne(`${apiBase}/settings/third-party-senders/s1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  // --- Reprocessing ---
  describe('Reprocessing', () => {
    it('should start reprocessing', () => {
      service.startReprocessing('2024-01-01', '2024-12-31').subscribe();
      const req = httpMock.expectOne(`${apiBase}/reprocessing/start`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ dateFrom: '2024-01-01', dateTo: '2024-12-31' });
      req.flush({ id: 'j1', status: 'pending' });
    });

    it('should cancel reprocessing', () => {
      service.cancelReprocessing('j1').subscribe();
      const req = httpMock.expectOne(`${apiBase}/reprocessing/cancel/j1`);
      expect(req.request.method).toBe('POST');
      req.flush({ id: 'j1', status: 'cancelled' });
    });

    it('should get current job', () => {
      service.getCurrentReprocessingJob().subscribe();
      const req = httpMock.expectOne(`${apiBase}/reprocessing/current`);
      req.flush(null);
    });

    it('should list all jobs', () => {
      service.getReprocessingJobs().subscribe();
      const req = httpMock.expectOne(`${apiBase}/reprocessing/jobs`);
      req.flush([]);
    });

    it('should get single job', () => {
      service.getReprocessingJob('j1').subscribe();
      const req = httpMock.expectOne(`${apiBase}/reprocessing/jobs/j1`);
      req.flush({ id: 'j1' });
    });
  });

  // --- Domains ---
  describe('Domains', () => {
    it('should get domains list', () => {
      service.getDomainsList().subscribe();
      const req = httpMock.expectOne(`${apiBase}/domains`);
      req.flush([]);
    });

    it('should get domain statistics', () => {
      service.getDomainStatistics(30).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/domains/statistics`);
      expect(req.request.params.get('daysBack')).toBe('30');
      req.flush([]);
    });

    it('should get domain by id', () => {
      service.getDomainById('d1').subscribe();
      const req = httpMock.expectOne(`${apiBase}/domains/d1`);
      req.flush({ id: 'd1', domain: 'test.com' });
    });

    it('should create domain', () => {
      service.createDomain({ domain: 'new.com' }).subscribe();
      const req = httpMock.expectOne(`${apiBase}/domains`);
      expect(req.request.method).toBe('POST');
      req.flush({ id: 'd2', domain: 'new.com' });
    });

    it('should update domain', () => {
      service.updateDomain('d1', { notes: 'updated' }).subscribe();
      const req = httpMock.expectOne(`${apiBase}/domains/d1`);
      expect(req.request.method).toBe('PUT');
      req.flush({ id: 'd1', domain: 'test.com', notes: 'updated' });
    });

    it('should delete domain', () => {
      service.deleteDomain('d1').subscribe();
      const req = httpMock.expectOne(`${apiBase}/domains/d1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ message: 'deleted' });
    });
  });

  // --- Utilities ---
  describe('deleteOldReports', () => {
    it('should delete old reports with date param', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      service.deleteOldReports(date).subscribe();
      const req = httpMock.expectOne((r) => r.url === `${apiBase}/dmarc-reports/old-reports`);
      expect(req.request.method).toBe('DELETE');
      expect(req.request.params.get('olderThan')).toBe('2023-01-01T00:00:00.000Z');
      req.flush({ deletedCount: 5 });
    });
  });
});
