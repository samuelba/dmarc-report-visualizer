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
});
