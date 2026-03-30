import { createSpyObj, SpyObj } from '../../testing/mock-helpers';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';
import { of, throwError } from 'rxjs';

describe('authInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let authService: SpyObj<AuthService>;
  let router: SpyObj<Router>;
  let snackBar: SpyObj<MatSnackBar>;

  beforeEach(() => {
    const authServiceSpy = createSpyObj('AuthService', ['refreshToken', 'logout', 'clearTokens']);
    const routerSpy = createSpyObj('Router', ['navigate']);
    const snackBarSpy = createSpyObj('MatSnackBar', ['open']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: MatSnackBar, useValue: snackBarSpy },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    authService = TestBed.inject(AuthService) as SpyObj<AuthService>;
    router = TestBed.inject(Router) as SpyObj<Router>;
    snackBar = TestBed.inject(MatSnackBar) as SpyObj<MatSnackBar>;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should pass through successful requests', () => {
    httpClient.get('/api/test').subscribe((response) => {
      expect(response).toEqual({ data: 'success' });
    });

    const req = httpMock.expectOne('/api/test');
    req.flush({ data: 'success' });
  });

  it('should handle 401 by refreshing token and retrying request', () => {
    authService.refreshToken.mockReturnValue(of(undefined as unknown as void));

    httpClient.get('/api/test').subscribe({
      next: (response) => {
        expect(response).toEqual({ data: 'success' });
        expect(authService.refreshToken).toHaveBeenCalled();
      },
      error: () => {
        throw new Error('Should not error');
      },
    });

    // First request fails with 401
    const req1 = httpMock.expectOne('/api/test');
    req1.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    // After token refresh, request is retried
    const req2 = httpMock.expectOne('/api/test');
    req2.flush({ data: 'success' });
  });

  it('should redirect to login when token refresh fails', () => {
    authService.refreshToken.mockReturnValue(throwError(() => ({ status: 401, message: 'Refresh failed' })));

    httpClient.get('/api/test').subscribe({
      next: () => {
        throw new Error('Should not succeed');
      },
      error: () => {
        expect(authService.refreshToken).toHaveBeenCalled();
        expect(authService.clearTokens).toHaveBeenCalled();
        expect(router.navigate).toHaveBeenCalledWith(['/login']);
      },
    });

    const req = httpMock.expectOne('/api/test');
    req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('should pass through non-401 errors', () => {
    httpClient.get('/api/test').subscribe({
      next: () => {
        throw new Error('Should not succeed');
      },
      error: (error) => {
        expect(error.status).toBe(500);
        expect(authService.refreshToken).not.toHaveBeenCalled();
      },
    });

    const req = httpMock.expectOne('/api/test');
    req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });
  });

  it('should handle SESSION_COMPROMISED error by showing notification and redirecting to login', () => {
    httpClient.get('/api/test').subscribe({
      next: () => {
        throw new Error('Should not succeed');
      },
      error: (error) => {
        expect(error.status).toBe(401);
        expect(snackBar.open).toHaveBeenCalledWith(
          'Your session was terminated for security reasons. Please log in again.',
          'Close',
          { duration: 8000 }
        );
        expect(authService.clearTokens).toHaveBeenCalled();
        expect(router.navigate).toHaveBeenCalledWith(['/login']);
        expect(authService.refreshToken).not.toHaveBeenCalled();
      },
    });

    const req = httpMock.expectOne('/api/test');
    req.flush(
      {
        message: 'Your session has been terminated for security reasons. Please log in again.',
        errorCode: 'SESSION_COMPROMISED',
      },
      { status: 401, statusText: 'Unauthorized' }
    );
  });

  it('should not attempt token refresh for SESSION_COMPROMISED error', () => {
    httpClient.get('/api/test').subscribe({
      next: () => {
        throw new Error('Should not succeed');
      },
      error: () => {
        expect(authService.refreshToken).not.toHaveBeenCalled();
        expect(authService.clearTokens).toHaveBeenCalled();
      },
    });

    const req = httpMock.expectOne('/api/test');
    req.flush({ errorCode: 'SESSION_COMPROMISED' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('should not attempt token refresh for validation errors', () => {
    httpClient.get('/api/test').subscribe({
      next: () => {
        throw new Error('Should not succeed');
      },
      error: (error) => {
        expect(error.status).toBe(401);
        expect(authService.refreshToken).not.toHaveBeenCalled();
      },
    });

    const req = httpMock.expectOne('/api/test');
    req.flush({ errorCode: 'INVALID_TOTP_CODE', message: 'Invalid code' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('should skip auto-refresh for auth/refresh endpoint', () => {
    httpClient.post('/api/auth/refresh', {}).subscribe({
      next: () => {
        throw new Error('Should not succeed');
      },
      error: (error) => {
        expect(error.status).toBe(401);
        expect(authService.refreshToken).not.toHaveBeenCalled();
      },
    });

    const req = httpMock.expectOne('/api/auth/refresh');
    req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
  });
});
