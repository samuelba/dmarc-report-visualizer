import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SmtpSettingsService, SmtpConfigResponse, SendEmailResult } from './smtp-settings.service';

describe('SmtpSettingsService', () => {
  let service: SmtpSettingsService;
  let httpMock: HttpTestingController;
  const apiBase = '/api/email';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SmtpSettingsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SmtpSettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getConfig', () => {
    it('should fetch SMTP configuration', () => {
      const mockConfig: SmtpConfigResponse = {
        configured: true,
        enabled: true,
        host: 'smtp.example.com',
        port: 587,
        securityMode: 'starttls',
        username: 'user',
        hasPassword: true,
        fromEmail: 'noreply@example.com',
        fromName: 'DMARC',
      };

      service.getConfig().subscribe((config) => {
        expect(config).toEqual(mockConfig);
      });

      const req = httpMock.expectOne(`${apiBase}/config`);
      expect(req.request.method).toBe('GET');
      req.flush(mockConfig);
    });
  });

  describe('updateConfig', () => {
    it('should POST config update', () => {
      const config = {
        host: 'smtp.example.com',
        port: 587,
        securityMode: 'starttls' as const,
        fromEmail: 'noreply@example.com',
        fromName: 'DMARC',
      };

      service.updateConfig(config).subscribe();

      const req = httpMock.expectOne(`${apiBase}/config`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.host).toBe('smtp.example.com');
      req.flush({ configured: true, enabled: true, hasPassword: false });
    });
  });

  describe('sendTestEmail', () => {
    it('should send test email', () => {
      const result: SendEmailResult = { success: true, messageId: 'msg-1' };

      service.sendTestEmail('test@example.com').subscribe((res) => {
        expect(res.success).toBe(true);
      });

      const req = httpMock.expectOne(`${apiBase}/test`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ to: 'test@example.com' });
      req.flush(result);
    });
  });

  describe('deleteConfig', () => {
    it('should delete SMTP configuration', () => {
      service.deleteConfig().subscribe();

      const req = httpMock.expectOne(`${apiBase}/config`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
