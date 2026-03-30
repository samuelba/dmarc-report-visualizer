import { createSpyObj, SpyObj } from '../../testing/mock-helpers';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authService: SpyObj<AuthService>;
  let router: SpyObj<Router>;

  beforeEach(() => {
    const authServiceSpy = createSpyObj('AuthService', ['isAuthenticated']);
    const routerSpy = createSpyObj('Router', ['createUrlTree']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });

    authService = TestBed.inject(AuthService) as SpyObj<AuthService>;
    router = TestBed.inject(Router) as SpyObj<Router>;
  });

  it('should allow access when user is authenticated', () => {
    authService.isAuthenticated.mockReturnValue(of(true));

    TestBed.runInInjectionContext(() => {
      const result = authGuard({} as any, {} as any);

      if (typeof result === 'boolean') {
        expect(result).toBe(true);
      } else if (result instanceof UrlTree) {
        throw new Error('Expected true but got UrlTree');
      } else if (result && typeof result === 'object' && 'subscribe' in result) {
        (result as any).subscribe((canActivate: boolean | UrlTree) => {
          expect(canActivate).toBe(true);
          expect(router.createUrlTree).not.toHaveBeenCalled();
        });
      } else {
        throw new Error('Unexpected result type');
      }
    });
  });

  it('should redirect to login when user is not authenticated', () => {
    const mockUrlTree = {} as UrlTree;
    authService.isAuthenticated.mockReturnValue(of(false));
    router.createUrlTree.mockReturnValue(mockUrlTree);

    TestBed.runInInjectionContext(() => {
      const result = authGuard({} as any, {} as any);

      if (result instanceof UrlTree) {
        expect(result).toBe(mockUrlTree);
        expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
      } else if (typeof result === 'boolean') {
        throw new Error('Expected UrlTree but got boolean');
      } else if (result && typeof result === 'object' && 'subscribe' in result) {
        (result as any).subscribe((canActivate: boolean | UrlTree) => {
          expect(canActivate).toBe(mockUrlTree);
          expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
        });
      } else {
        throw new Error('Unexpected result type');
      }
    });
  });

  describe('return URL storage', () => {
    beforeEach(() => {
      // Clear sessionStorage before each test
      sessionStorage.clear();
    });

    afterEach(() => {
      // Clean up sessionStorage after each test
      sessionStorage.clear();
    });

    it('should store return URL when redirecting unauthenticated user', () => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.mockReturnValue(of(false));
      router.createUrlTree.mockReturnValue(mockUrlTree);

      const mockState = { url: '/explore?recordId=123' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(mockUrlTree);
            expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=123');
          });
        } else {
          expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=123');
        }
      });
    });

    it('should not store login page as return URL', () => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.mockReturnValue(of(false));
      router.createUrlTree.mockReturnValue(mockUrlTree);

      const mockState = { url: '/login' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(mockUrlTree);
            expect(sessionStorage.getItem('returnUrl')).toBeNull();
          });
        } else {
          expect(sessionStorage.getItem('returnUrl')).toBeNull();
        }
      });
    });

    it('should not store setup page as return URL', () => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.mockReturnValue(of(false));
      router.createUrlTree.mockReturnValue(mockUrlTree);

      const mockState = { url: '/setup' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(mockUrlTree);
            expect(sessionStorage.getItem('returnUrl')).toBeNull();
          });
        } else {
          expect(sessionStorage.getItem('returnUrl')).toBeNull();
        }
      });
    });

    it('should preserve query parameters in stored URL', () => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.mockReturnValue(of(false));
      router.createUrlTree.mockReturnValue(mockUrlTree);

      const mockState = { url: '/reports?startDate=2024-01-01&endDate=2024-01-31' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(mockUrlTree);
            expect(sessionStorage.getItem('returnUrl')).toBe('/reports?startDate=2024-01-01&endDate=2024-01-31');
          });
        } else {
          expect(sessionStorage.getItem('returnUrl')).toBe('/reports?startDate=2024-01-01&endDate=2024-01-31');
        }
      });
    });

    it('should not affect authenticated users', () => {
      authService.isAuthenticated.mockReturnValue(of(true));

      const mockState = { url: '/explore?recordId=123' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (typeof result === 'boolean') {
          expect(result).toBe(true);
          expect(sessionStorage.getItem('returnUrl')).toBeNull();
        } else if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(true);
            expect(sessionStorage.getItem('returnUrl')).toBeNull();
          });
        } else {
          throw new Error('Unexpected result type');
        }
      });
    });

    it('should not overwrite existing return URL with a different URL', () => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.mockReturnValue(of(false));
      router.createUrlTree.mockReturnValue(mockUrlTree);

      // Set an existing return URL
      sessionStorage.setItem('returnUrl', '/explore?recordId=123');

      const mockState = { url: '/reports' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(mockUrlTree);
            // Should preserve the original return URL
            expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=123');
          });
        } else {
          // Should preserve the original return URL
          expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=123');
        }
      });
    });

    it('should overwrite /dashboard with a more specific URL', () => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.mockReturnValue(of(false));
      router.createUrlTree.mockReturnValue(mockUrlTree);

      // Set dashboard as existing return URL
      sessionStorage.setItem('returnUrl', '/dashboard');

      const mockState = { url: '/explore?recordId=456' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(mockUrlTree);
            // Should overwrite dashboard with more specific URL
            expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=456');
          });
        } else {
          // Should overwrite dashboard with more specific URL
          expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=456');
        }
      });
    });

    it('should not overwrite /dashboard with /dashboard', () => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.mockReturnValue(of(false));
      router.createUrlTree.mockReturnValue(mockUrlTree);

      // Set dashboard as existing return URL
      sessionStorage.setItem('returnUrl', '/dashboard');

      const mockState = { url: '/dashboard' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(mockUrlTree);
            // Should keep dashboard
            expect(sessionStorage.getItem('returnUrl')).toBe('/dashboard');
          });
        } else {
          // Should keep dashboard
          expect(sessionStorage.getItem('returnUrl')).toBe('/dashboard');
        }
      });
    });
  });
});
