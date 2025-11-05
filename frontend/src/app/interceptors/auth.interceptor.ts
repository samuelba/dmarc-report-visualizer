import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../services/auth.service';

// Track if a token refresh is in progress to prevent multiple simultaneous refresh requests
let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

/**
 * HTTP interceptor that adds the access token to outgoing requests
 * and handles automatic token refresh on 401 responses
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  // Skip adding auth header for these endpoints (they don't need or provide their own auth)
  const skipAuthUrls = ['/auth/login', '/auth/setup', '/auth/refresh', '/auth/check-setup'];
  const shouldSkipAuth = skipAuthUrls.some((url) => req.url.includes(url));

  // Determine which request to send (with or without auth header)
  const clonedReq = shouldSkipAuth
    ? req
    : authService.getAccessToken()
      ? req.clone({
          setHeaders: {
            Authorization: `Bearer ${authService.getAccessToken()}`,
          },
        })
      : req;

  // Handle the request and catch 401 errors for ALL requests
  return next(clonedReq).pipe(
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

          // Clear tokens from memory
          authService.clearTokens();

          // Redirect to login
          router.navigate(['/login']);

          return throwError(() => error);
        }

        // Skip auto-refresh for these endpoints to prevent infinite loops or let components handle errors
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
      switchMap((response) => {
        // Refresh successful, update the token
        isRefreshing = false;
        refreshTokenSubject.next(response.accessToken);

        // Retry the original request with the new token
        const clonedReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${response.accessToken}`,
          },
        });
        return next(clonedReq);
      }),
      catchError((error) => {
        // Refresh failed, redirect to login
        isRefreshing = false;

        // Note: If this is a SESSION_COMPROMISED error, it will be caught
        // by the main interceptor's catchError block above, which will
        // show the snackbar and redirect. We just need to clean up here.
        authService.clearTokens();
        router.navigate(['/login']);

        return throwError(() => error);
      })
    );
  } else {
    // A refresh is already in progress, wait for it to complete
    return refreshTokenSubject.pipe(
      filter((token) => token !== null),
      take(1),
      switchMap((token) => {
        // Retry the original request with the new token
        const clonedReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`,
          },
        });
        return next(clonedReq);
      })
    );
  }
}
