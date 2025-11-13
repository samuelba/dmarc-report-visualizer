import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['isAuthenticated']);
    const routerSpy = jasmine.createSpyObj('Router', ['createUrlTree']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
  });

  it('should allow access when user is authenticated', (done) => {
    authService.isAuthenticated.and.returnValue(of(true));

    TestBed.runInInjectionContext(() => {
      const result = authGuard({} as any, {} as any);

      if (typeof result === 'boolean') {
        expect(result).toBe(true);
        done();
      } else if (result instanceof UrlTree) {
        done.fail('Expected true but got UrlTree');
      } else if (result && typeof result === 'object' && 'subscribe' in result) {
        (result as any).subscribe((canActivate: boolean | UrlTree) => {
          expect(canActivate).toBe(true);
          expect(router.createUrlTree).not.toHaveBeenCalled();
          done();
        });
      } else {
        done.fail('Unexpected result type');
      }
    });
  });

  it('should redirect to login when user is not authenticated', (done) => {
    const mockUrlTree = {} as UrlTree;
    authService.isAuthenticated.and.returnValue(of(false));
    router.createUrlTree.and.returnValue(mockUrlTree);

    TestBed.runInInjectionContext(() => {
      const result = authGuard({} as any, {} as any);

      if (result instanceof UrlTree) {
        expect(result).toBe(mockUrlTree);
        expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
        done();
      } else if (typeof result === 'boolean') {
        done.fail('Expected UrlTree but got boolean');
      } else if (result && typeof result === 'object' && 'subscribe' in result) {
        (result as any).subscribe((canActivate: boolean | UrlTree) => {
          expect(canActivate).toBe(mockUrlTree);
          expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
          done();
        });
      } else {
        done.fail('Unexpected result type');
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

    it('should store return URL when redirecting unauthenticated user', (done) => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.and.returnValue(of(false));
      router.createUrlTree.and.returnValue(mockUrlTree);

      const mockState = { url: '/explore?recordId=123' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(mockUrlTree);
            expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=123');
            done();
          });
        } else {
          expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=123');
          done();
        }
      });
    });

    it('should not store login page as return URL', (done) => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.and.returnValue(of(false));
      router.createUrlTree.and.returnValue(mockUrlTree);

      const mockState = { url: '/login' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(mockUrlTree);
            expect(sessionStorage.getItem('returnUrl')).toBeNull();
            done();
          });
        } else {
          expect(sessionStorage.getItem('returnUrl')).toBeNull();
          done();
        }
      });
    });

    it('should not store setup page as return URL', (done) => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.and.returnValue(of(false));
      router.createUrlTree.and.returnValue(mockUrlTree);

      const mockState = { url: '/setup' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(mockUrlTree);
            expect(sessionStorage.getItem('returnUrl')).toBeNull();
            done();
          });
        } else {
          expect(sessionStorage.getItem('returnUrl')).toBeNull();
          done();
        }
      });
    });

    it('should preserve query parameters in stored URL', (done) => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.and.returnValue(of(false));
      router.createUrlTree.and.returnValue(mockUrlTree);

      const mockState = { url: '/reports?startDate=2024-01-01&endDate=2024-01-31' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(mockUrlTree);
            expect(sessionStorage.getItem('returnUrl')).toBe('/reports?startDate=2024-01-01&endDate=2024-01-31');
            done();
          });
        } else {
          expect(sessionStorage.getItem('returnUrl')).toBe('/reports?startDate=2024-01-01&endDate=2024-01-31');
          done();
        }
      });
    });

    it('should not affect authenticated users', (done) => {
      authService.isAuthenticated.and.returnValue(of(true));

      const mockState = { url: '/explore?recordId=123' } as any;

      TestBed.runInInjectionContext(() => {
        const result = authGuard({} as any, mockState);

        if (typeof result === 'boolean') {
          expect(result).toBe(true);
          expect(sessionStorage.getItem('returnUrl')).toBeNull();
          done();
        } else if (result && typeof result === 'object' && 'subscribe' in result) {
          (result as any).subscribe((canActivate: boolean | UrlTree) => {
            expect(canActivate).toBe(true);
            expect(sessionStorage.getItem('returnUrl')).toBeNull();
            done();
          });
        } else {
          done.fail('Unexpected result type');
        }
      });
    });

    it('should not overwrite existing return URL with a different URL', (done) => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.and.returnValue(of(false));
      router.createUrlTree.and.returnValue(mockUrlTree);

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
            done();
          });
        } else {
          // Should preserve the original return URL
          expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=123');
          done();
        }
      });
    });

    it('should overwrite /dashboard with a more specific URL', (done) => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.and.returnValue(of(false));
      router.createUrlTree.and.returnValue(mockUrlTree);

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
            done();
          });
        } else {
          // Should overwrite dashboard with more specific URL
          expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=456');
          done();
        }
      });
    });

    it('should not overwrite /dashboard with /dashboard', (done) => {
      const mockUrlTree = {} as UrlTree;
      authService.isAuthenticated.and.returnValue(of(false));
      router.createUrlTree.and.returnValue(mockUrlTree);

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
            done();
          });
        } else {
          // Should keep dashboard
          expect(sessionStorage.getItem('returnUrl')).toBe('/dashboard');
          done();
        }
      });
    });
  });
});
