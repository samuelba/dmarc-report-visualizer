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
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MaterialModule } from '../../shared/material.module';
import { UserService, InviteDetailsResponse } from '../../services/user.service';
import { PasswordStrengthComponent } from '../../components/password-strength/password-strength.component';
import { PASSWORD_MIN_LENGTH, PASSWORD_SPECIAL_CHARS_REGEX } from '../../constants/password.constants';
import { MessageComponent } from '../../components/message/message.component';
import { UserRole } from '../../models/user-role.enum';

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
  selector: 'app-invite-accept',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, PasswordStrengthComponent, MessageComponent, RouterLink],
  templateUrl: './invite-accept.component.html',
  styleUrls: ['./invite-accept.component.scss'],
})
export class InviteAcceptComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  token: string = '';
  inviteDetails: InviteDetailsResponse | null = null;
  acceptForm!: FormGroup;
  loading = true;
  error: string | null = null;
  hidePassword = true;
  hidePasswordConfirmation = true;
  isSubmitting = false;

  ngOnInit(): void {
    // Extract token from route params
    this.token = this.route.snapshot.params['token'];

    // Initialize form
    this.acceptForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH), passwordStrengthValidator()]],
      passwordConfirmation: ['', [Validators.required, passwordMatchValidator('password')]],
    });

    // Re-validate password confirmation when password changes
    this.acceptForm.get('password')?.valueChanges.subscribe(() => {
      this.acceptForm.get('passwordConfirmation')?.updateValueAndValidity();
    });

    // Load invite details
    this.loadInviteDetails();
  }

  get passwordValue(): string {
    return this.acceptForm.get('password')?.value || '';
  }

  get roleLabel(): string {
    if (!this.inviteDetails?.role) {
      return '';
    }
    return this.inviteDetails.role === UserRole.ADMINISTRATOR ? 'Administrator' : 'User';
  }

  loadInviteDetails(): void {
    this.loading = true;
    this.error = null;

    this.userService.getInviteDetails(this.token).subscribe({
      next: (details) => {
        this.loading = false;
        this.inviteDetails = details;

        if (!details.valid) {
          this.error = details.error || 'This invitation is invalid or has expired.';
        }
      },
      error: (err) => {
        this.loading = false;

        if (err.error?.message) {
          this.error = err.error.message;
        } else if (err.status === 0) {
          this.error = 'Unable to connect to the server. Please check your connection.';
        } else {
          this.error = 'Failed to load invitation details. Please try again.';
        }
      },
    });
  }

  onSubmit(): void {
    // Mark all fields as touched to show validation errors
    if (this.acceptForm.invalid) {
      Object.keys(this.acceptForm.controls).forEach((key) => {
        this.acceptForm.get(key)?.markAsTouched();
      });
      return;
    }

    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.error = null;

    const { password, passwordConfirmation } = this.acceptForm.value;

    this.userService.acceptInvite(this.token, password, passwordConfirmation).subscribe({
      next: () => {
        // Navigate to login on success
        this.router.navigate(['/login'], {
          queryParams: { message: 'Account created successfully. Please log in.' },
        });
      },
      error: (err) => {
        this.isSubmitting = false;

        // Handle different error types
        if (err.error?.message) {
          // Backend validation error
          if (Array.isArray(err.error.message)) {
            this.error = err.error.message.join(', ');
          } else {
            this.error = err.error.message;
          }
        } else if (err.status === 0) {
          // Network error
          this.error = 'Unable to connect to the server. Please check your connection.';
        } else {
          // Generic error
          this.error = 'Failed to accept invitation. Please try again.';
        }
      },
    });
  }
}
