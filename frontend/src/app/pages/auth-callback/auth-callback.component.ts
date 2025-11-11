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
    // After SAML callback, both access token and refresh token are set as HttpOnly cookies
    // Fetch user info directly using the access token cookie
    this.authService.fetchCurrentUser().subscribe({
      next: () => {
        // Redirect to dashboard on success
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        console.error('Failed to fetch user info after SAML login:', error);
        // Redirect to login on error with specific error message
        this.router.navigate(['/login'], {
          queryParams: { error: 'saml_callback_failed' },
        });
      },
    });
  }
}
