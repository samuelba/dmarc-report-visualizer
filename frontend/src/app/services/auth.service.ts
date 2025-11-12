import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, map } from 'rxjs';
import { clearReturnUrl } from '../utils/url-validation.utils';

export interface User {
  id: string;
  email: string;
  authProvider: string;
}

export interface AuthResponse {
  // Note: Access token and refresh token are set in HttpOnly cookies
  user: User;
}

export interface SetupDto {
  email: string;
  password: string;
  passwordConfirmation: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = '/api';

  private currentUser$ = new BehaviorSubject<User | null>(null);

  /**
   * Check if initial setup is needed (no users exist)
   */
  checkSetup(): Observable<{ needsSetup: boolean }> {
    return this.http.get<{ needsSetup: boolean }>(`${this.apiBase}/auth/check-setup`);
  }

  /**
   * Create the initial user account
   */
  setup(email: string, password: string, passwordConfirmation: string): Observable<AuthResponse> {
    const dto: SetupDto = { email, password, passwordConfirmation };
    return this.http.post<AuthResponse>(`${this.apiBase}/auth/setup`, dto).pipe(
      tap((response) => {
        this.currentUser$.next(response.user);
      })
    );
  }

  /**
   * Login with email and password
   */
  login(email: string, password: string): Observable<AuthResponse> {
    const dto: LoginDto = { email, password };
    return this.http.post<AuthResponse>(`${this.apiBase}/auth/login`, dto).pipe(
      tap((response) => {
        this.currentUser$.next(response.user);
      })
    );
  }

  /**
   * Logout and clear tokens
   */
  logout(): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/auth/logout`, {}).pipe(
      tap(() => {
        this.currentUser$.next(null);
        // Clear any stored return URL on logout
        clearReturnUrl();
      })
    );
  }

  /**
   * Refresh the access/refresh token using the refresh and access token cookies
   * Both new tokens are set in HttpOnly cookies
   */
  refreshToken(): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/auth/refresh`, {});
  }

  /**
   * Get current user information from the server
   */
  fetchCurrentUser(): Observable<User> {
    return this.http.get<User>(`${this.apiBase}/auth/me`).pipe(
      tap((user) => {
        this.currentUser$.next(user);
      })
    );
  }

  /**
   * Initialize authentication state by attempting to refresh token
   * Should be called on app initialization
   * Tries to use existing access token to fetch user info, and if expired, attempts to refresh
   */
  initializeAuth(): Observable<boolean> {
    return new Observable((observer) => {
      // Try to fetch user info using existing access token cookie
      this.fetchCurrentUser().subscribe({
        next: () => {
          // Valid access token exists
          observer.next(true);
          observer.complete();
        },
        error: (_error) => {
          // Access token is invalid or expired
          // Try to refresh the token using the refresh and access token cookies
          this.refreshToken().subscribe({
            next: () => {
              // Token refreshed successfully, now fetch user info
              this.fetchCurrentUser().subscribe({
                next: () => {
                  observer.next(true);
                  observer.complete();
                },
                error: () => {
                  // Still failed after refresh - user needs to log in
                  observer.next(false);
                  observer.complete();
                },
              });
            },
            error: () => {
              // No valid refresh token - this is normal for first visit or after logout
              // Silently fail and let the user proceed to login
              observer.next(false);
              observer.complete();
            },
          });
        },
      });
    });
  }

  /**
   * Change the current user's password
   * Returns message (new tokens are set in cookies)
   */
  changePassword(
    currentPassword: string,
    newPassword: string,
    newPasswordConfirmation: string
  ): Observable<{ message: string }> {
    const dto: ChangePasswordDto = { currentPassword, newPassword, newPasswordConfirmation };
    return this.http.post<{ message: string }>(`${this.apiBase}/auth/change-password`, dto);
  }

  /**
   * Get the current user as an observable
   */
  getCurrentUser(): Observable<User | null> {
    return this.currentUser$.asObservable();
  }

  /**
   * Get the current user value
   */
  getCurrentUserValue(): User | null {
    return this.currentUser$.value;
  }

  /**
   * Check if user is authenticated (has valid user data)
   */
  isAuthenticated(): Observable<boolean> {
    return this.currentUser$.pipe(map((user) => user !== null));
  }

  /**
   * Clear user data (used on logout/session expiry)
   */
  clearTokens(): void {
    this.currentUser$.next(null);
  }

  // SAML Configuration Methods

  /**
   * Get SAML and login status (public endpoint - no auth required)
   * Returns SAML status and password login status in a single call
   */
  getSamlAndLoginStatus(): Observable<{
    samlEnabled: boolean;
    passwordLoginAllowed: boolean;
  }> {
    return this.http
      .get<{
        enabled: boolean;
        configured: boolean;
        passwordLoginAllowed: boolean;
      }>(`${this.apiBase}/auth/saml/status`)
      .pipe(
        map((status) => ({
          samlEnabled: status.enabled && status.configured,
          passwordLoginAllowed: status.passwordLoginAllowed,
        }))
      );
  }

  /**
   * Get SAML configuration
   */
  getSamlConfig(): Observable<any> {
    return this.http.get<any>(`${this.apiBase}/auth/saml/config`);
  }

  /**
   * Update SAML configuration
   */
  updateSamlConfig(config: any): Observable<any> {
    return this.http.post<any>(`${this.apiBase}/auth/saml/config`, config);
  }

  /**
   * Enable SAML authentication
   */
  enableSaml(): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/auth/saml/config/enable`, {});
  }

  /**
   * Disable SAML authentication
   */
  disableSaml(): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/auth/saml/config/disable`, {});
  }

  /**
   * Download SP metadata XML
   */
  downloadSamlMetadata(): Observable<Blob> {
    return this.http.get(`${this.apiBase}/auth/saml/metadata`, {
      responseType: 'blob',
    });
  }

  /**
   * Get the SAML login URL
   */
  getSamlLoginUrl(): string {
    return `${this.apiBase}/auth/saml/login`;
  }

  /**
   * Disable password-based login
   */
  disablePasswordLogin(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBase}/auth/saml/config/disable-password-login`, {});
  }

  /**
   * Enable password-based login
   */
  enablePasswordLogin(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBase}/auth/saml/config/enable-password-login`, {});
  }
}
