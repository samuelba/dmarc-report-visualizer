import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService, AuthResponse, TokenResponse, User } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  const apiBase = '/api';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('checkSetup', () => {
    it('should call the correct endpoint', () => {
      const mockResponse = { needsSetup: true };

      service.checkSetup().subscribe((response) => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${apiBase}/auth/check-setup`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });

  describe('setup', () => {
    it('should call correct endpoint and store access token', () => {
      const email = 'test@example.com';
      const password = 'SecurePass123!';
      const passwordConfirmation = 'SecurePass123!';
      const mockResponse: AuthResponse = {
        accessToken: 'test-access-token',
        user: { id: 'user-123', email, authProvider: 'local' },
      };

      service.setup(email, password, passwordConfirmation).subscribe((response) => {
        expect(response).toEqual(mockResponse);
        expect(service.getAccessToken()).toBe('test-access-token');
      });

      const req = httpMock.expectOne(`${apiBase}/auth/setup`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email, password, passwordConfirmation });
      req.flush(mockResponse);
    });
  });

  describe('login', () => {
    it('should call correct endpoint and store access token', () => {
      const email = 'test@example.com';
      const password = 'SecurePass123!';
      const mockResponse: AuthResponse = {
        accessToken: 'test-access-token',
        user: { id: 'user-123', email, authProvider: 'local' },
      };

      service.login(email, password).subscribe((response) => {
        expect(response).toEqual(mockResponse);
        expect(service.getAccessToken()).toBe('test-access-token');
      });

      const req = httpMock.expectOne(`${apiBase}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email, password });
      req.flush(mockResponse);
    });
  });

  describe('logout', () => {
    it('should call correct endpoint and clear access token', () => {
      // First set a token
      const mockLoginResponse: AuthResponse = {
        accessToken: 'test-access-token',
        user: { id: 'user-123', email: 'test@example.com', authProvider: 'local' },
      };

      service.login('test@example.com', 'password').subscribe();
      const loginReq = httpMock.expectOne(`${apiBase}/auth/login`);
      loginReq.flush(mockLoginResponse);

      expect(service.getAccessToken()).toBe('test-access-token');

      // Now logout
      service.logout().subscribe(() => {
        expect(service.getAccessToken()).toBeNull();
      });

      const logoutReq = httpMock.expectOne(`${apiBase}/auth/logout`);
      expect(logoutReq.request.method).toBe('POST');
      logoutReq.flush({});
    });
  });

  describe('refreshToken', () => {
    it('should call correct endpoint and update access token', () => {
      const mockResponse: TokenResponse = {
        accessToken: 'new-access-token',
      };

      service.refreshToken().subscribe((response) => {
        expect(response).toEqual(mockResponse);
        expect(service.getAccessToken()).toBe('new-access-token');
      });

      const req = httpMock.expectOne(`${apiBase}/auth/refresh`);
      expect(req.request.method).toBe('POST');
      req.flush(mockResponse);
    });
  });

  describe('changePassword', () => {
    it('should call correct endpoint', () => {
      const currentPassword = 'OldPass123!';
      const newPassword = 'NewPass456!';
      const newPasswordConfirmation = 'NewPass456!';

      service.changePassword(currentPassword, newPassword, newPasswordConfirmation).subscribe();

      const req = httpMock.expectOne(`${apiBase}/auth/change-password`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ currentPassword, newPassword, newPasswordConfirmation });
      req.flush({});
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no token is set', (done) => {
      service.isAuthenticated().subscribe((isAuth) => {
        expect(isAuth).toBe(false);
        done();
      });
    });

    it('should return true when token is set', (done) => {
      const mockResponse: AuthResponse = {
        accessToken: 'test-access-token',
        user: { id: 'user-123', email: 'test@example.com', authProvider: 'local' },
      };

      service.login('test@example.com', 'password').subscribe(() => {
        service.isAuthenticated().subscribe((isAuth) => {
          expect(isAuth).toBe(true);
          done();
        });
      });

      const req = httpMock.expectOne(`${apiBase}/auth/login`);
      req.flush(mockResponse);
    });
  });

  describe('getCurrentUser', () => {
    it('should return null when no user is logged in', (done) => {
      service.getCurrentUser().subscribe((user) => {
        expect(user).toBeNull();
        done();
      });
    });

    it('should return user after login', (done) => {
      const mockUser: User = { id: 'user-123', email: 'test@example.com', authProvider: 'local' };
      const mockResponse: AuthResponse = {
        accessToken: 'test-access-token',
        user: mockUser,
      };

      service.login('test@example.com', 'password').subscribe(() => {
        service.getCurrentUser().subscribe((user) => {
          expect(user).toEqual(mockUser);
          done();
        });
      });

      const req = httpMock.expectOne(`${apiBase}/auth/login`);
      req.flush(mockResponse);
    });
  });

  describe('clearTokens', () => {
    it('should clear access token and current user', (done) => {
      const mockResponse: AuthResponse = {
        accessToken: 'test-access-token',
        user: { id: 'user-123', email: 'test@example.com', authProvider: 'local' },
      };

      // First login to set tokens
      service.login('test@example.com', 'password').subscribe(() => {
        expect(service.getAccessToken()).toBe('test-access-token');

        // Clear tokens
        service.clearTokens();

        // Verify tokens are cleared
        expect(service.getAccessToken()).toBeNull();
        service.getCurrentUser().subscribe((user) => {
          expect(user).toBeNull();
          done();
        });
      });

      const req = httpMock.expectOne(`${apiBase}/auth/login`);
      req.flush(mockResponse);
    });
  });
});
