import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiToken, ApiTokenService, tokenStatus } from './api-token.service';

const token: ApiToken = {
  id: 't1',
  name: 'laptop',
  prefix: 'dmarc_pat_abcdef',
  scopes: ['mcp:read'],
  createdAt: '2026-11-01T00:00:00Z',
  expiresAt: '2026-12-01T00:00:00Z',
  lastUsedAt: null,
  lastUsedIp: null,
  revokedAt: null,
};

describe('ApiTokenService', () => {
  let service: ApiTokenService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiTokenService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists own tokens', () => {
    let result: ApiToken[] | null | undefined;
    service.listOwn().subscribe((r) => (result = r));

    http.expectOne({ method: 'GET', url: '/api/auth/api-tokens' }).flush([token]);

    expect(result).toEqual([token]);
  });

  it('reports a disabled feature (404) as null', () => {
    let result: ApiToken[] | null | undefined;
    service.listOwn().subscribe((r) => (result = r));

    http.expectOne('/api/auth/api-tokens').flush({}, { status: 404, statusText: 'Not Found' });

    expect(result).toBeNull();
  });

  it('passes other errors on', () => {
    let failed = false;
    service.listOwn().subscribe({ error: () => (failed = true) });

    http.expectOne('/api/auth/api-tokens').flush({}, { status: 500, statusText: 'Server Error' });

    expect(failed).toBe(true);
  });

  it('creates, revokes and revokes all', () => {
    service.create({ name: 'laptop', expiresInDays: 90, allowRawXml: false }).subscribe();
    const create = http.expectOne({ method: 'POST', url: '/api/auth/api-tokens' });
    expect(create.request.body).toEqual({ name: 'laptop', expiresInDays: 90, allowRawXml: false });
    create.flush({ token: 'dmarc_pat_x', apiToken: token });

    service.revoke('t1').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/auth/api-tokens/t1' }).flush(token);

    service.revokeAll().subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/auth/api-tokens' }).flush({ revoked: 1 });
  });

  it('uses the admin endpoints for all tokens', () => {
    service.listAll().subscribe();
    http.expectOne({ method: 'GET', url: '/api/auth/api-tokens/all' }).flush([]);

    service.revokeAny('t1').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/auth/api-tokens/all/t1' }).flush(token);
  });

  it.each([
    [200, true],
    [404, false],
    [500, false],
  ])('isEnabled is %s → %s', (status, expected) => {
    let result: boolean | undefined;
    service.isEnabled().subscribe((r) => (result = r));

    const req = http.expectOne('/api/auth/api-tokens');
    if (status === 200) {
      req.flush([]);
    } else {
      req.flush({}, { status, statusText: 'Error' });
    }

    expect(result).toBe(expected);
  });

  it('builds the MCP endpoint URL from the current origin', () => {
    expect(service.mcpEndpointUrl()).toBe(`${window.location.origin}/api/mcp`);
  });
});

describe('tokenStatus', () => {
  const now = new Date('2026-11-15T00:00:00Z');

  it('is active before expiry', () => {
    expect(tokenStatus(token, now)).toBe('active');
  });

  it('is expired after expiry', () => {
    expect(tokenStatus({ ...token, expiresAt: '2026-11-14T00:00:00Z' }, now)).toBe('expired');
  });

  it('is revoked when revoked, even if not expired', () => {
    expect(tokenStatus({ ...token, revokedAt: '2026-11-10T00:00:00Z' }, now)).toBe('revoked');
  });
});
