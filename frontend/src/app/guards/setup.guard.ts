import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

/**
 * Guard to protect the setup page.
 * Only allows access if setup is needed (no users exist).
 * Redirects to login page if setup is already complete.
 */
export const setupGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.checkSetup().pipe(
    take(1),
    map((response) => {
      if (response.needsSetup) {
        return true;
      }

      // Redirect to login page if setup is already complete
      return router.createUrlTree(['/login']);
    })
  );
};
