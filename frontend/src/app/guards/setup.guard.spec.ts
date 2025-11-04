import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { setupGuard } from './setup.guard';
import { AuthService } from '../services/auth.service';

describe('setupGuard', () => {
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['checkSetup']);
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

  it('should allow access when setup is needed', (done) => {
    authService.checkSetup.and.returnValue(of({ needsSetup: true }));

    TestBed.runInInjectionContext(() => {
      const result = setupGuard({} as any, {} as any);

      if (typeof result === 'boolean') {
        expect(result).toBe(true);
        done();
      } else if (result instanceof UrlTree) {
        done.fail('Expected true but got UrlTree');
        done();
      } else if (result && typeof result === 'object' && 'subscribe' in result) {
        (result as any).subscribe((canActivate: boolean | UrlTree) => {
          expect(canActivate).toBe(true);
          expect(router.createUrlTree).not.toHaveBeenCalled();
          done();
        });
      } else {
        done.fail('Unexpected result type');
        done();
      }
    });
  });

  it('should redirect to login when setup is complete', (done) => {
    const mockUrlTree = {} as UrlTree;
    authService.checkSetup.and.returnValue(of({ needsSetup: false }));
    router.createUrlTree.and.returnValue(mockUrlTree);

    TestBed.runInInjectionContext(() => {
      const result = setupGuard({} as any, {} as any);

      if (result instanceof UrlTree) {
        expect(result).toBe(mockUrlTree);
        expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
        done();
      } else if (typeof result === 'boolean') {
        done.fail('Expected UrlTree but got boolean');
        done();
      } else if (result && typeof result === 'object' && 'subscribe' in result) {
        (result as any).subscribe((canActivate: boolean | UrlTree) => {
          expect(canActivate).toBe(mockUrlTree);
          expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
          done();
        });
      } else {
        done.fail('Unexpected result type');
        done();
      }
    });
  });
});
