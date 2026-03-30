import { createSpyObj, SpyObj } from '../../testing/mock-helpers';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { setupGuard } from './setup.guard';
import { AuthService } from '../services/auth.service';

describe('setupGuard', () => {
  let authService: SpyObj<AuthService>;
  let router: SpyObj<Router>;

  beforeEach(() => {
    const authServiceSpy = createSpyObj('AuthService', ['checkSetup']);
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

  it('should allow access when setup is needed', () => {
    authService.checkSetup.mockReturnValue(of({ needsSetup: true }));

    TestBed.runInInjectionContext(() => {
      const result = setupGuard({} as any, {} as any);

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

  it('should redirect to login when setup is complete', () => {
    const mockUrlTree = {} as UrlTree;
    authService.checkSetup.mockReturnValue(of({ needsSetup: false }));
    router.createUrlTree.mockReturnValue(mockUrlTree);

    TestBed.runInInjectionContext(() => {
      const result = setupGuard({} as any, {} as any);

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
});
