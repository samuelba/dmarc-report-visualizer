import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { of, throwError } from 'rxjs';

describe('authInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['getAccessToken', 'refreshToken', 'logout']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should add Authorization header when access token exists', () => {
    authService.getAccessToken.and.returnValue('test-access-token');

    httpClient.get('/api/test').subscribe();

    const req = httpMock.expectOne('/api/test');
    expect(req.request.headers.has('Authorization')).toBe(true);
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-access-token');
    req.flush({});
  });

  it('should not add Authorization header when no access token exists', () => {
    authService.getAccessToken.and.returnValue(null);

    httpClient.get('/api/test').subscribe();

    const req = httpMock.expectOne('/api/test');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should skip adding Authorization header for login endpoint', () => {
    authService.getAccessToken.and.returnValue('test-access-token');

    httpClient.post('/api/auth/login', {}).subscribe();

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should skip adding Authorization header for setup endpoint', () => {
    authService.getAccessToken.and.returnValue('test-access-token');

    httpClient.post('/api/auth/setup', {}).subscribe();

    const req = httpMock.expectOne('/api/auth/setup');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should skip adding Authorization header for refresh endpoint', () => {
    authService.getAccessToken.and.returnValue('test-access-token');

    httpClient.post('/api/auth/refresh', {}).subscribe();

    const req = httpMock.expectOne('/api/auth/refresh');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should skip adding Authorization header for check-setup endpoint', () => {
    authService.getAccessToken.and.returnValue('test-access-token');

    httpClient.get('/api/auth/check-setup').subscribe();

    const req = httpMock.expectOne('/api/auth/check-setup');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should handle 401 by refreshing token and retrying request', (done) => {
    authService.getAccessToken.and.returnValue('old-access-token');
    authService.refreshToken.and.returnValue(of({ accessToken: 'new-access-token' }));

    httpClient.get('/api/test').subscribe({
      next: (response) => {
        expect(response).toEqual({ data: 'success' });
        expect(authService.refreshToken).toHaveBeenCalled();
        done();
      },
      error: () => done.fail('Should not error'),
    });

    // First request with old token fails with 401
    const req1 = httpMock.expectOne('/api/test');
    expect(req1.request.headers.get('Authorization')).toBe('Bearer old-access-token');
    req1.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    // Retry request with new token succeeds
    const req2 = httpMock.expectOne('/api/test');
    expect(req2.request.headers.get('Authorization')).toBe('Bearer new-access-token');
    req2.flush({ data: 'success' });
  });

  it('should redirect to login when token refresh fails', (done) => {
    authService.getAccessToken.and.returnValue('old-access-token');
    authService.refreshToken.and.returnValue(throwError(() => ({ status: 401, message: 'Refresh failed' })));
    authService.logout.and.returnValue(of(void 0));

    httpClient.get('/api/test').subscribe({
      next: () => done.fail('Should not succeed'),
      error: () => {
        expect(authService.refreshToken).toHaveBeenCalled();
        expect(authService.logout).toHaveBeenCalled();
        expect(router.navigate).toHaveBeenCalledWith(['/login']);
        done();
      },
    });

    const req = httpMock.expectOne('/api/test');
    req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('should pass through non-401 errors', (done) => {
    authService.getAccessToken.and.returnValue('test-access-token');

    httpClient.get('/api/test').subscribe({
      next: () => done.fail('Should not succeed'),
      error: (error) => {
        expect(error.status).toBe(500);
        expect(authService.refreshToken).not.toHaveBeenCalled();
        done();
      },
    });

    const req = httpMock.expectOne('/api/test');
    req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });
  });
});
