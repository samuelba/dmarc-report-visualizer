import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MaterialModule } from '../../shared/material.module';
import { AuthService } from '../../services/auth.service';
import { getValidatedReturnUrl, clearReturnUrl } from '../../utils/url-validation.utils';
import { TotpInputComponent } from '../../components/totp-input/totp-input';
import { MessageComponent } from '../../components/message/message.component';

@Component({
  selector: 'app-totp-verification',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, TotpInputComponent, MessageComponent],
  templateUrl: './totp-verification.component.html',
  styleUrls: ['./totp-verification.component.scss'],
})
export class TotpVerificationComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  verificationForm!: FormGroup;
  isSubmitting = false;
  errorMessage = '';
  useRecoveryCode = false;

  ngOnInit(): void {
    this.verificationForm = this.fb.group({
      totpCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      recoveryCode: [
        '',
        [Validators.required, Validators.pattern(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i)],
      ],
    });

    // Set initial validators based on mode
    this.updateValidators();
  }

  toggleMode(): void {
    this.useRecoveryCode = !this.useRecoveryCode;
    this.errorMessage = '';
    this.updateValidators();

    // Clear both fields when switching modes
    this.verificationForm.patchValue({
      totpCode: '',
      recoveryCode: '',
    });
  }

  private updateValidators(): void {
    const totpCodeControl = this.verificationForm.get('totpCode');
    const recoveryCodeControl = this.verificationForm.get('recoveryCode');

    if (this.useRecoveryCode) {
      // Recovery code mode
      totpCodeControl?.clearValidators();
      totpCodeControl?.updateValueAndValidity();
      recoveryCodeControl?.setValidators([
        Validators.required,
        Validators.pattern(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i),
      ]);
      recoveryCodeControl?.updateValueAndValidity();
    } else {
      // TOTP code mode
      recoveryCodeControl?.clearValidators();
      recoveryCodeControl?.updateValueAndValidity();
      totpCodeControl?.setValidators([Validators.required, Validators.pattern(/^\d{6}$/)]);
      totpCodeControl?.updateValueAndValidity();
    }
  }

  onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }

    // Validate the active field
    const activeControl = this.useRecoveryCode
      ? this.verificationForm.get('recoveryCode')
      : this.verificationForm.get('totpCode');

    if (activeControl?.invalid) {
      activeControl?.markAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    if (this.useRecoveryCode) {
      this.verifyRecovery();
    } else {
      this.verify();
    }
  }

  verify(): void {
    const totpCode = this.verificationForm.get('totpCode')?.value;

    this.authService.verifyTotp(totpCode).subscribe({
      next: () => {
        // Fetch full user info (including role) before navigating
        // The verify response doesn't include role, so we need to fetch it from /me
        this.authService.fetchCurrentUser().subscribe({
          next: () => {
            const returnUrl = getValidatedReturnUrl();
            clearReturnUrl();
            this.router.navigateByUrl(returnUrl);
          },
          error: (error) => {
            console.error('Failed to fetch user info after TOTP verification:', error);
            // Still navigate even if fetch fails (user is authenticated)
            const returnUrl = getValidatedReturnUrl();
            clearReturnUrl();
            this.router.navigateByUrl(returnUrl);
          },
        });
      },
      error: (error) => {
        this.isSubmitting = false;

        // Handle different error types
        if (error.status === 429) {
          // Rate limit error
          this.errorMessage = error.error?.message || 'Too many failed attempts. Please try again later.';
        } else if (error.status === 401) {
          // Invalid code or expired token
          if (error.error?.message?.includes('expired') || error.error?.message?.includes('session')) {
            this.errorMessage = 'Verification session expired. Please log in again.';
            // Redirect to login after a delay
            setTimeout(() => {
              this.router.navigate(['/login']);
            }, 2000);
          } else {
            this.errorMessage = 'Invalid verification code. Please try again.';
          }
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
          this.errorMessage = 'Verification failed. Please try again.';
        }
      },
    });
  }

  verifyRecovery(): void {
    const recoveryCode = this.verificationForm.get('recoveryCode')?.value.toUpperCase();

    this.authService.verifyRecoveryCode(recoveryCode).subscribe({
      next: () => {
        // Fetch full user info (including role) before navigating
        // The verify response doesn't include role, so we need to fetch it from /me
        this.authService.fetchCurrentUser().subscribe({
          next: () => {
            const returnUrl = getValidatedReturnUrl();
            clearReturnUrl();
            this.router.navigateByUrl(returnUrl);
          },
          error: (error) => {
            console.error('Failed to fetch user info after recovery code verification:', error);
            // Still navigate even if fetch fails (user is authenticated)
            const returnUrl = getValidatedReturnUrl();
            clearReturnUrl();
            this.router.navigateByUrl(returnUrl);
          },
        });
      },
      error: (error) => {
        this.isSubmitting = false;

        // Handle different error types
        if (error.status === 429) {
          // Rate limit error
          this.errorMessage = error.error?.message || 'Too many failed attempts. Please try again later.';
        } else if (error.status === 401) {
          // Invalid code or expired token
          if (error.error?.message?.includes('expired') || error.error?.message?.includes('session')) {
            this.errorMessage = 'Verification session expired. Please log in again.';
            // Redirect to login after a delay
            setTimeout(() => {
              this.router.navigate(['/login']);
            }, 2000);
          } else if (error.error?.message?.includes('used')) {
            this.errorMessage = 'This recovery code has already been used. Please use a different code.';
          } else {
            this.errorMessage = 'Invalid recovery code. Please try again.';
          }
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
          this.errorMessage = 'Verification failed. Please try again.';
        }
      },
    });
  }

  formatRecoveryCode(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Add dashes every 4 characters
    if (value.length > 0) {
      value = value.match(/.{1,4}/g)?.join('-') || value;
    }

    // Limit to 19 characters (XXXX-XXXX-XXXX-XXXX)
    value = value.substring(0, 19);

    this.verificationForm.patchValue({ recoveryCode: value }, { emitEvent: false });
  }

  get isFormValid(): boolean {
    if (this.useRecoveryCode) {
      return this.verificationForm.get('recoveryCode')?.valid || false;
    } else {
      return this.verificationForm.get('totpCode')?.valid || false;
    }
  }
}
