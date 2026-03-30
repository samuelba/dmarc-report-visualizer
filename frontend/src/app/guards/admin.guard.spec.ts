import { createSpyObj, SpyObj } from '../../testing/mock-helpers';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { adminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';

describe('adminGuard', () => {
  let authService: SpyObj<AuthService>;
  let router: SpyObj<Router>;

  beforeEach(() => {
    const authServiceSpy = createSpyObj('AuthService', ['isAdministrator']);
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

  it('should allow access when user is an administrator', () => {
    authService.isAdministrator.mockReturnValue(of(true));

    TestBed.runInInjectionContext(() => {
      const result = adminGuard({} as any, {} as any);

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

  it('should block access when user is not an administrator', () => {
    const mockUrlTree = {} as UrlTree;
    authService.isAdministrator.mockReturnValue(of(false));
    router.createUrlTree.mockReturnValue(mockUrlTree);

    TestBed.runInInjectionContext(() => {
      const result = adminGuard({} as any, {} as any);

      if (result instanceof UrlTree) {
        expect(result).toBe(mockUrlTree);
        expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
      } else if (typeof result === 'boolean') {
        throw new Error('Expected UrlTree but got boolean');
      } else if (result && typeof result === 'object' && 'subscribe' in result) {
        (result as any).subscribe((canActivate: boolean | UrlTree) => {
          expect(canActivate).toBe(mockUrlTree);
          expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
        });
      } else {
        throw new Error('Unexpected result type');
      }
    });
  });

  it('should redirect to home page when user is not an administrator', () => {
    const mockUrlTree = {} as UrlTree;
    authService.isAdministrator.mockReturnValue(of(false));
    router.createUrlTree.mockReturnValue(mockUrlTree);

    TestBed.runInInjectionContext(() => {
      const result = adminGuard({} as any, {} as any);

      if (result && typeof result === 'object' && 'subscribe' in result) {
        (result as any).subscribe((_canActivate: boolean | UrlTree) => {
          expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
        });
      } else {
        expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
      }
    });
  });
});
