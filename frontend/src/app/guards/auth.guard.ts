import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

/**
 * Guard to protect routes that require authentication.
 * Redirects to login page if user is not authenticated.
 * Stores the requested URL for post-login redirect.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAuthenticated().pipe(
    take(1),
    map((isAuthenticated) => {
      if (isAuthenticated) {
        return true;
      }

      // Store the requested URL for post-login redirect
      const returnUrl = state.url;

      // Only store if it's not empty and not the login or setup page
      if (returnUrl && !returnUrl.startsWith('/login') && !returnUrl.startsWith('/setup')) {
        const existingReturnUrl = sessionStorage.getItem('returnUrl');

        // Only overwrite if:
        // 1. No existing return URL, OR
        // 2. Existing return URL is just '/dashboard' (default) and new URL is more specific
        if (!existingReturnUrl || (existingReturnUrl === '/dashboard' && returnUrl !== '/dashboard')) {
          sessionStorage.setItem('returnUrl', returnUrl);
        }
      }

      // Redirect to login page if not authenticated
      return router.createUrlTree(['/login']);
    })
  );
};
