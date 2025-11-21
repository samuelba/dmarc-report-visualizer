import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

/**
 * Guard to protect routes that require administrator role.
 * Redirects to home page if user is not an administrator.
 */
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAdministrator().pipe(
    take(1),
    map((isAdmin) => {
      if (isAdmin) {
        return true;
      }

      // Redirect non-admins to home page
      return router.createUrlTree(['/']);
    })
  );
};
