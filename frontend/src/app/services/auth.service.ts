import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, map } from 'rxjs';

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface TokenResponse {
  accessToken: string;
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

  private accessToken$ = new BehaviorSubject<string | null>(null);
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
        this.accessToken$.next(response.accessToken);
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
        this.accessToken$.next(response.accessToken);
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
        this.accessToken$.next(null);
        this.currentUser$.next(null);
      })
    );
  }

  /**
   * Refresh the access token using the refresh token cookie
   */
  refreshToken(): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(`${this.apiBase}/auth/refresh`, {}).pipe(
      tap((response) => {
        this.accessToken$.next(response.accessToken);
      })
    );
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
   * Silently fails if no refresh token exists (returns false)
   */
  initializeAuth(): Observable<boolean> {
    return new Observable((observer) => {
      this.refreshToken().subscribe({
        next: () => {
          // Token refreshed successfully, now fetch user info
          this.fetchCurrentUser().subscribe({
            next: () => {
              observer.next(true);
              observer.complete();
            },
            error: () => {
              // Failed to fetch user info, clear token
              this.accessToken$.next(null);
              observer.next(false);
              observer.complete();
            },
          });
        },
        error: () => {
          // No valid refresh token cookie - this is normal for first visit or after logout
          // Silently fail and let the user proceed to login
          observer.next(false);
          observer.complete();
        },
      });
    });
  }

  /**
   * Change the current user's password
   * Returns new access token to maintain current session
   */
  changePassword(
    currentPassword: string,
    newPassword: string,
    newPasswordConfirmation: string
  ): Observable<{ message: string; accessToken: string }> {
    const dto: ChangePasswordDto = { currentPassword, newPassword, newPasswordConfirmation };
    return this.http.post<{ message: string; accessToken: string }>(`${this.apiBase}/auth/change-password`, dto).pipe(
      tap((response) => {
        // Update the access token to maintain the current session
        this.accessToken$.next(response.accessToken);
      })
    );
  }

  /**
   * Get the current access token
   */
  getAccessToken(): string | null {
    return this.accessToken$.value;
  }

  /**
   * Get the current user as an observable
   */
  getCurrentUser(): Observable<User | null> {
    return this.currentUser$.asObservable();
  }

  /**
   * Check if the user is authenticated
   */
  isAuthenticated(): Observable<boolean> {
    return this.accessToken$.pipe(map((token) => token !== null));
  }
}
