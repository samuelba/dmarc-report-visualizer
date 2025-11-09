import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `
    <div style="display: flex; justify-content: center; align-items: center; height: 100vh;">
      <div style="text-align: center;">
        <h2>Completing authentication...</h2>
        <p>Please wait while we log you in.</p>
      </div>
    </div>
  `,
})
export class AuthCallbackComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  ngOnInit(): void {
    // After SAML callback, the refresh token is set as an HttpOnly cookie
    // Use the refresh token to obtain an access token and fetch user info
    this.authService.refreshToken().subscribe({
      next: (tokenResponse) => {
        // Access token obtained successfully, now fetch user info
        this.authService.setAccessToken(tokenResponse.accessToken);

        this.authService.fetchCurrentUser().subscribe({
          next: () => {
            // Redirect to dashboard on success
            this.router.navigate(['/dashboard']);
          },
          error: (error) => {
            console.error('Failed to fetch user info after SAML login:', error);
            // Redirect to login on error with specific error message
            this.router.navigate(['/login'], {
              queryParams: { error: 'saml_user_fetch_failed' },
            });
          },
        });
      },
      error: (error) => {
        console.error('Failed to refresh token after SAML callback:', error);
        // Redirect to login on error with specific error message
        this.router.navigate(['/login'], {
          queryParams: { error: 'saml_callback_failed' },
        });
      },
    });
  }
}
