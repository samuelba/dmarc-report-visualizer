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
import { MaterialModule } from '../../shared/material.module';
import { AuthService } from '../../services/auth.service';
import { PasswordStrengthComponent } from '../../components/password-strength/password-strength.component';
import { PASSWORD_MIN_LENGTH, PASSWORD_SPECIAL_CHARS_REGEX } from '../../constants/password.constants';

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

// Custom validator to ensure new password differs from current password
function passwordNotEqualValidator(otherFieldName: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.parent) {
      return null;
    }

    const otherField = control.parent.get(otherFieldName);
    if (!otherField || !control.value || !otherField.value) {
      return null;
    }

    if (control.value === otherField.value) {
      return { passwordEqual: true };
    }

    return null;
  };
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, PasswordStrengthComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  passwordForm!: FormGroup;
  hideCurrentPassword = true;
  hideNewPassword = true;
  hideNewPasswordConfirmation = true;
  isSubmitting = false;
  errorMessage = '';
  successMessage = '';
  currentUserEmail = '';
  authProvider = '';
  isSamlUser = false;

  ngOnInit(): void {
    // Get current user email and auth provider
    this.authService.getCurrentUser().subscribe((user) => {
      if (user) {
        this.currentUserEmail = user.email;
        this.authProvider = user.authProvider;
        this.isSamlUser = user.authProvider === 'saml';
      }
    });

    // Set up password change form
    this.passwordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: [
        '',
        [
          Validators.required,
          Validators.minLength(PASSWORD_MIN_LENGTH),
          passwordStrengthValidator(),
          passwordNotEqualValidator('currentPassword'),
        ],
      ],
      newPasswordConfirmation: ['', [Validators.required, passwordMatchValidator('newPassword')]],
    });

    // Re-validate password confirmation when new password changes
    this.passwordForm.get('newPassword')?.valueChanges.subscribe(() => {
      this.passwordForm.get('newPasswordConfirmation')?.updateValueAndValidity();
    });

    // Re-validate new password when current password changes (for equality check)
    this.passwordForm.get('currentPassword')?.valueChanges.subscribe(() => {
      this.passwordForm.get('newPassword')?.updateValueAndValidity();
    });
  }

  get newPasswordValue(): string {
    return this.passwordForm.get('newPassword')?.value || '';
  }

  onSubmit(): void {
    // Mark all fields as touched to show validation errors
    if (this.passwordForm.invalid) {
      Object.keys(this.passwordForm.controls).forEach((key) => {
        this.passwordForm.get(key)?.markAsTouched();
      });
      return;
    }

    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    const { currentPassword, newPassword, newPasswordConfirmation } = this.passwordForm.value;

    this.authService.changePassword(currentPassword, newPassword, newPasswordConfirmation).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        this.successMessage = response.message + ' You will need to log in again on other devices.';

        // Clear the form
        this.passwordForm.reset();
        Object.keys(this.passwordForm.controls).forEach((key) => {
          this.passwordForm.get(key)?.setErrors(null);
          this.passwordForm.get(key)?.markAsUntouched();
        });
      },
      error: (error) => {
        this.isSubmitting = false;

        // Handle different error types
        if (error.status === 401) {
          // Current password is incorrect
          this.errorMessage = 'Current password is incorrect.';
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
          this.errorMessage = 'Password change failed. Please try again.';
        }
      },
    });
  }
}
