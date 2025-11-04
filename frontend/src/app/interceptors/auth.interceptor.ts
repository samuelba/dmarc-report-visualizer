import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
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

  // Skip adding auth header for these endpoints (they don't need or provide their own auth)
  const skipAuthUrls = ['/auth/login', '/auth/setup', '/auth/refresh', '/auth/check-setup'];
  const shouldSkipAuth = skipAuthUrls.some((url) => req.url.includes(url));

  if (shouldSkipAuth) {
    return next(req);
  }

  // Get the access token
  const accessToken = authService.getAccessToken();

  // Clone request with auth header if token exists
  const clonedReq = accessToken
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    : req;

  // Handle the request and catch 401 errors
  return next(clonedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only handle 401 Unauthorized errors
      // Skip auto-refresh for these endpoints to prevent infinite loops or let components handle errors
      const skipAutoRefresh = ['/auth/change-password', '/auth/me', '/auth/refresh'].some((url) =>
        req.url.includes(url)
      );

      if (error.status === 401 && !skipAutoRefresh) {
        return handle401Error(req, next, authService, router);
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
        authService.logout().subscribe({
          complete: () => {
            router.navigate(['/login']);
          },
          error: () => {
            // Even if logout fails, navigate to login
            router.navigate(['/login']);
          },
        });
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
