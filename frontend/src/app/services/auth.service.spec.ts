import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService, AuthResponse, User } from './auth.service';

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
    it('should call correct endpoint and store user', () => {
      const email = 'test@example.com';
      const password = 'SecurePass123!';
      const passwordConfirmation = 'SecurePass123!';
      const mockResponse: AuthResponse = {
        user: { id: 'user-123', email, authProvider: 'local' },
      };

      service.setup(email, password, passwordConfirmation).subscribe((response) => {
        expect(response).toEqual(mockResponse);
        expect(service.getCurrentUserValue()).toEqual(mockResponse.user);
      });

      const req = httpMock.expectOne(`${apiBase}/auth/setup`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email, password, passwordConfirmation });
      req.flush(mockResponse);
    });
  });

  describe('login', () => {
    it('should call correct endpoint and store user', () => {
      const email = 'test@example.com';
      const password = 'SecurePass123!';
      const mockResponse: AuthResponse = {
        user: { id: 'user-123', email, authProvider: 'local' },
      };

      service.login(email, password).subscribe((response) => {
        expect(response).toEqual(mockResponse);
        expect(service.getCurrentUserValue()).toEqual(mockResponse.user);
      });

      const req = httpMock.expectOne(`${apiBase}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email, password });
      req.flush(mockResponse);
    });
  });

  describe('logout', () => {
    it('should call correct endpoint and clear user', () => {
      // First set a user
      const mockLoginResponse: AuthResponse = {
        user: { id: 'user-123', email: 'test@example.com', authProvider: 'local' },
      };

      service.login('test@example.com', 'password').subscribe();
      const loginReq = httpMock.expectOne(`${apiBase}/auth/login`);
      loginReq.flush(mockLoginResponse);

      expect(service.getCurrentUserValue()).toEqual(mockLoginResponse.user);

      // Now logout
      service.logout().subscribe(() => {
        expect(service.getCurrentUserValue()).toBeNull();
      });

      const logoutReq = httpMock.expectOne(`${apiBase}/auth/logout`);
      expect(logoutReq.request.method).toBe('POST');
      logoutReq.flush({});
    });

    it('should clear return URL from sessionStorage on logout', () => {
      // Set up a user and return URL
      const mockLoginResponse: AuthResponse = {
        user: { id: 'user-123', email: 'test@example.com', authProvider: 'local' },
      };

      service.login('test@example.com', 'password').subscribe();
      const loginReq = httpMock.expectOne(`${apiBase}/auth/login`);
      loginReq.flush(mockLoginResponse);

      // Store a return URL
      sessionStorage.setItem('returnUrl', '/explore?recordId=123');
      expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=123');

      // Logout
      service.logout().subscribe(() => {
        // Verify return URL is cleared
        expect(sessionStorage.getItem('returnUrl')).toBeNull();
      });

      const logoutReq = httpMock.expectOne(`${apiBase}/auth/logout`);
      logoutReq.flush({});
    });

    it('should still work correctly when no return URL exists', () => {
      // Set up a user
      const mockLoginResponse: AuthResponse = {
        user: { id: 'user-123', email: 'test@example.com', authProvider: 'local' },
      };

      service.login('test@example.com', 'password').subscribe();
      const loginReq = httpMock.expectOne(`${apiBase}/auth/login`);
      loginReq.flush(mockLoginResponse);

      // Ensure no return URL exists
      sessionStorage.removeItem('returnUrl');
      expect(sessionStorage.getItem('returnUrl')).toBeNull();

      // Logout should still work
      service.logout().subscribe(() => {
        expect(service.getCurrentUserValue()).toBeNull();
        expect(sessionStorage.getItem('returnUrl')).toBeNull();
      });

      const logoutReq = httpMock.expectOne(`${apiBase}/auth/logout`);
      logoutReq.flush({});
    });
  });

  describe('refreshToken', () => {
    it('should call correct endpoint to refresh tokens in cookies', () => {
      service.refreshToken().subscribe(() => {
        // Tokens are now in HttpOnly cookies, nothing to check in service
      });

      const req = httpMock.expectOne(`${apiBase}/auth/refresh`);
      expect(req.request.method).toBe('POST');
      req.flush(null);
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
    it('should return false when no user is set', (done) => {
      service.isAuthenticated().subscribe((isAuth) => {
        expect(isAuth).toBe(false);
        done();
      });
    });

    it('should return true when user is set', (done) => {
      const mockResponse: AuthResponse = {
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
    it('should clear current user', (done) => {
      const mockResponse: AuthResponse = {
        user: { id: 'user-123', email: 'test@example.com', authProvider: 'local' },
      };

      // First login to set user
      service.login('test@example.com', 'password').subscribe(() => {
        expect(service.getCurrentUserValue()).toEqual(mockResponse.user);

        // Clear tokens
        service.clearTokens();

        // Verify user is cleared
        expect(service.getCurrentUserValue()).toBeNull();
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
