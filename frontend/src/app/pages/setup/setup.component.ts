import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MaterialModule } from '../../shared/material.module';
import { AuthService } from '../../services/auth.service';
import { PasswordStrengthComponent } from '../../components/password-strength/password-strength.component';
import { PASSWORD_MIN_LENGTH, PASSWORD_SPECIAL_CHARS_REGEX } from '../../constants/password.constants';
import { clearReturnUrl } from '../../utils/url-validation.utils';

// Custom validator for password strength
function passwordStrengthValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (!value) {
      return null;
    }

    const hasMinLength = value.length >= PASSWORD_MIN_LENGTH;
    const hasUppercase = /[A-Z]/.test(value);
    const hasLowercase = /[a-z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSpecial = PASSWORD_SPECIAL_CHARS_REGEX.test(value);

    const passwordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

    return passwordValid ? null : { passwordStrength: true };
  };
}

// Custom validator for password confirmation matching
function passwordMatchValidator(passwordField: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.parent) {
      return null;
    }

    const password = control.parent.get(passwordField);
    const passwordConfirmation = control;

    if (!password || !passwordConfirmation) {
      return null;
    }

    if (passwordConfirmation.value === '') {
      return null;
    }

    if (password.value !== passwordConfirmation.value) {
      return { passwordMismatch: true };
    }

    return null;
  };
}

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, PasswordStrengthComponent],
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss'],
})
export class SetupComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  setupForm!: FormGroup;
  hidePassword = true;
  hidePasswordConfirmation = true;
  isSubmitting = false;
  errorMessage = '';

  ngOnInit(): void {
    this.setupForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), passwordStrengthValidator()]],
      passwordConfirmation: ['', [Validators.required, passwordMatchValidator('password')]],
    });

    // Re-validate password confirmation when password changes
    this.setupForm.get('password')?.valueChanges.subscribe(() => {
      this.setupForm.get('passwordConfirmation')?.updateValueAndValidity();
    });
  }

  get passwordValue(): string {
    return this.setupForm.get('password')?.value || '';
  }

  onSubmit(): void {
    // Mark all fields as touched to show validation errors
    if (this.setupForm.invalid) {
      Object.keys(this.setupForm.controls).forEach((key) => {
        this.setupForm.get(key)?.markAsTouched();
      });
      return;
    }

    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const { email, password, passwordConfirmation } = this.setupForm.value;

    this.authService.setup(email, password, passwordConfirmation).subscribe({
      next: () => {
        // Fetch full user info (including role) before navigating
        // The setup response doesn't include role, so we need to fetch it from /me
        this.authService.fetchCurrentUser().subscribe({
          next: () => {
            // Clear any stored return URL (setup should always go to dashboard)
            clearReturnUrl();
            // Navigate to dashboard on success
            this.router.navigate(['/dashboard']);
          },
          error: (error) => {
            console.error('Failed to fetch user info after setup:', error);
            // Still navigate even if fetch fails (user is authenticated)
            clearReturnUrl();
            this.router.navigate(['/dashboard']);
          },
        });
      },
      error: (error) => {
        this.isSubmitting = false;

        // Handle different error types
        if (error.error?.message) {
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
          this.errorMessage = 'Setup failed. Please try again.';
        }
      },
    });
  }
}
