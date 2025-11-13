import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MaterialModule } from '../../shared/material.module';
import { AuthService } from '../../services/auth.service';
import { getValidatedReturnUrl, clearReturnUrl } from '../../utils/url-validation.utils';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  loginForm!: FormGroup;
  hidePassword = true;
  isSubmitting = false;
  errorMessage = '';
  retryAfter = 0;
  countdownInterval?: number;
  showSsoButton = false;
  showPasswordForm = true;
  passwordLoginDisabledMessage = '';

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });

    // Check SAML and password login status in a single API call
    this.authService.getSamlAndLoginStatus().subscribe({
      next: (status) => {
        this.showSsoButton = status.samlEnabled;
        this.showPasswordForm = status.passwordLoginAllowed;
        if (!status.passwordLoginAllowed) {
          this.passwordLoginDisabledMessage = 'Password login is disabled. Use SSO to sign in.';
        }
      },
      error: (err) => {
        console.error('Error checking login status:', err);
        // Default to showing password form and hiding SSO button on error
        this.showPasswordForm = true;
        this.showSsoButton = false;
      },
    });

    // Redirect if already logged in
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/']);
    }
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) {
      window.clearInterval(this.countdownInterval);
    }
  }

  onSubmit(): void {
    // Mark all fields as touched to show validation errors
    if (this.loginForm.invalid) {
      Object.keys(this.loginForm.controls).forEach((key) => {
        this.loginForm.get(key)?.markAsTouched();
      });
      return;
    }

    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.stopCountdown();

    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).subscribe({
      next: () => {
        // Get return URL from session storage
        const returnUrl = getValidatedReturnUrl();

        // Clear the stored return URL
        clearReturnUrl();

        // Navigate to return URL or default dashboard
        this.router.navigateByUrl(returnUrl);
      },
      error: (error) => {
        this.isSubmitting = false;

        // Handle different error types
        if (error.status === 429) {
          // Rate limit error
          this.retryAfter = error.error?.retryAfter || 900;
          this.errorMessage = error.error?.message || 'Too many failed attempts. Please try again later.';
          this.startCountdown();
        } else if (error.status === 423) {
          // Account locked error
          this.retryAfter = error.error?.retryAfter || 900;
          this.errorMessage = error.error?.message || 'Account temporarily locked. Please try again later.';
          this.startCountdown();
        } else if (error.status === 401) {
          // Authentication error - generic message for security
          this.errorMessage = 'Invalid email or password.';
        } else if (error.error?.message) {
          // Backend validation error
          if (Array.isArray(error.error.message)) {
            this.errorMessage = error.error.message.join(', ');
          } else {
            this.errorMessage = error.error.message;
          }
        } else if (error.status === 0) {
          // Network error
          this.errorMessage = 'Unable to connect to the server. Please check your connection.';
        } else {
          // Generic error
          this.errorMessage = 'Login failed. Please try again.';
        }
      },
    });
  }

  private startCountdown(): void {
    this.stopCountdown();

    this.countdownInterval = window.setInterval(() => {
      this.retryAfter--;

      if (this.retryAfter <= 0) {
        this.stopCountdown();
        this.errorMessage = '';
      } else {
        // Update error message with countdown
        const minutes = Math.floor(this.retryAfter / 60);
        const seconds = this.retryAfter % 60;
        const timeString =
          minutes > 0
            ? `${minutes} minute${minutes > 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}`
            : `${seconds} second${seconds !== 1 ? 's' : ''}`;

        if (this.errorMessage.includes('locked')) {
          this.errorMessage = `Account temporarily locked. Please try again in ${timeString}.`;
        } else {
          this.errorMessage = `Too many failed attempts. Please try again in ${timeString}.`;
        }
      }
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownInterval) {
      window.clearInterval(this.countdownInterval);
      this.countdownInterval = undefined;
    }
  }

  get isRateLimited(): boolean {
    return this.retryAfter > 0;
  }

  loginWithSso(): void {
    // Redirect to SAML login endpoint
    window.location.href = this.authService.getSamlLoginUrl();
  }
}
