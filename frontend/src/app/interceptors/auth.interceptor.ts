import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../services/auth.service';

// Track if a token refresh is in progress to prevent multiple simultaneous refresh requests
let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<boolean | null>(null);

/**
 * HTTP interceptor that handles automatic token refresh on 401 responses
 * Note: Access token is now stored in HttpOnly cookie and sent automatically by browser
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  // All requests now include cookies automatically (including accessToken cookie)
  // No need to manually add Authorization header

  // Handle the request and catch 401 errors
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only handle 401 Unauthorized errors
      if (error.status === 401) {
        const errorBody = error.error;

        // Check for session compromise (token theft detected)
        // This must be checked FIRST, before any skipAutoRefresh logic
        if (errorBody?.errorCode === 'SESSION_COMPROMISED') {
          // Show user-friendly notification
          snackBar.open('Your session was terminated for security reasons. Please log in again.', 'Close', {
            duration: 8000,
          });

          // Clear user data from memory
          authService.clearTokens();

          // Redirect to login
          router.navigate(['/login']);

          return throwError(() => error);
        }

        // Check if this is a validation error (not an auth error)
        const isValidationError =
          errorBody?.errorCode &&
          ['INVALID_TOTP_CODE', 'INVALID_RECOVERY_CODE', 'RECOVERY_CODE_ALREADY_USED', 'INVALID_PASSWORD'].includes(
            errorBody.errorCode
          );

        // Skip auto-refresh for validation errors - these should be handled by components
        if (isValidationError) {
          return throwError(() => error);
        }

        // Skip auto-refresh for these endpoints to prevent infinite loops
        const skipAutoRefresh = ['/auth/change-password', '/auth/me', '/auth/refresh'].some((url) =>
          req.url.includes(url)
        );

        if (!skipAutoRefresh) {
          return handle401Error(req, next, authService, router);
        }
      }
      return throwError(() => error);
    })
  );
};

/**
 * Handle 401 errors by attempting to refresh the token
 */
function handle401Error(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router
): Observable<HttpEvent<unknown>> {
  // If not already refreshing, start the refresh process
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return authService.refreshToken().pipe(
      switchMap(() => {
        // Refresh successful - new access token is now in cookie
        isRefreshing = false;
        refreshTokenSubject.next(true);

        // Retry the original request (cookie will be sent automatically)
        // Note: If the retry fails with a validation error, it will be caught
        // by the main interceptor's catchError and handled appropriately
        return next(req);
      }),
      catchError((error) => {
        // Refresh failed, redirect to login
        isRefreshing = false;

        // Check if this is a validation error from the retried request
        // If so, don't redirect - just pass the error through
        const errorBody = error?.error;
        const isValidationError =
          errorBody?.errorCode &&
          ['INVALID_TOTP_CODE', 'INVALID_RECOVERY_CODE', 'RECOVERY_CODE_ALREADY_USED', 'INVALID_PASSWORD'].includes(
            errorBody.errorCode
          );

        if (isValidationError) {
          // This is a validation error from the retry, not a refresh failure
          // Don't clear tokens or redirect, just pass the error through
          return throwError(() => error);
        }

        // Actual refresh failure - clear tokens and redirect
        authService.clearTokens();
        router.navigate(['/login']);

        return throwError(() => error);
      })
    );
  } else {
    // A refresh is already in progress, wait for it to complete
    return refreshTokenSubject.pipe(
      filter((result) => result !== null),
      take(1),
      switchMap(() => {
        // Retry the original request (cookie will be sent automatically)
        return next(req);
      })
    );
  }
}
