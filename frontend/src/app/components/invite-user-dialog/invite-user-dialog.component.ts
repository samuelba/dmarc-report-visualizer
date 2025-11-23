import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserService, InviteResponse } from '../../services/user.service';
import { MessageComponent } from '../message/message.component';
import { UserRole } from '../../models/user-role.enum';
import { SmtpSettingsService } from '../../pages/settings/smtp-settings/smtp-settings.service';

@Component({
  selector: 'app-invite-user-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, MessageComponent],
  templateUrl: './invite-user-dialog.component.html',
  styleUrls: ['./invite-user-dialog.component.scss'],
})
export class InviteUserDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<InviteUserDialogComponent>);
  private readonly smtpService = inject(SmtpSettingsService);

  inviteForm: FormGroup;
  generatedInvite: InviteResponse | null = null;
  isLoading = false;
  errorMessage = '';
  smtpConfigured = signal(false);

  roles = [
    { value: UserRole.USER, label: 'User' },
    { value: UserRole.ADMINISTRATOR, label: 'Administrator' },
  ];

  constructor() {
    this.inviteForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      role: [UserRole.USER, Validators.required],
    });
  }

  ngOnInit() {
    // Check SMTP configuration status
    this.smtpService.getConfig().subscribe({
      next: (config) => {
        this.smtpConfigured.set(config.configured && config.enabled);
      },
      error: (err) => {
        console.error('Failed to check SMTP config:', err);
        this.smtpConfigured.set(false);
      },
    });
  }

  generateInvite(): void {
    if (this.inviteForm.invalid) {
      this.errorMessage = 'Please fill in all required fields correctly';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const { email, role } = this.inviteForm.value;

    this.userService.createInvite(email, role).subscribe({
      next: (response: InviteResponse) => {
        this.generatedInvite = response;
        this.isLoading = false;

        // Show appropriate success message based on email status
        if (response.emailStatus === 'sent') {
          this.snackBar.open('Invite created and email sent successfully!', 'Close', { duration: 3000 });
        } else if (response.emailStatus === 'failed') {
          this.snackBar.open('Invite created but email failed to send', 'Close', { duration: 4000 });
        } else {
          this.snackBar.open('Invite created', 'Close', { duration: 4000 });
        }
      },
      error: (error) => {
        this.isLoading = false;

        // Provide detailed error messages
        if (error.status === 409) {
          this.errorMessage = 'A user with this email already exists.';
        } else if (error.status === 403) {
          this.errorMessage = 'You do not have permission to create invites.';
        } else if (error.error?.message) {
          this.errorMessage = error.error.message;
        } else {
          this.errorMessage = 'Failed to create invite. Please try again.';
        }
      },
    });
  }

  copyLink(): void {
    if (!this.generatedInvite) {
      return;
    }

    navigator.clipboard.writeText(this.generatedInvite.inviteLink).then(
      () => {
        this.snackBar.open('Invite link copied to clipboard', 'Close', { duration: 2000 });
      },
      () => {
        this.snackBar.open('Failed to copy to clipboard', 'Close', { duration: 2000 });
      }
    );
  }

  close(): void {
    this.dialogRef.close(this.generatedInvite !== null);
  }

  get expirationDate(): string {
    if (!this.generatedInvite) {
      return '';
    }
    return new Date(this.generatedInvite.expiresAt).toLocaleString();
  }

  getEmailStatusLabel(): string {
    if (!this.generatedInvite) {
      return '';
    }

    switch (this.generatedInvite.emailStatus) {
      case 'sent':
        return 'Email Sent';
      case 'failed':
        return 'Email Failed';
      case 'not_configured':
        return 'SMTP Not Configured';
      default:
        return 'Unknown';
    }
  }

  getEmailStatusDescription(): string {
    if (!this.generatedInvite) {
      return '';
    }

    switch (this.generatedInvite.emailStatus) {
      case 'sent':
        return 'The invitation email was successfully sent to the user.';
      case 'failed':
        return 'The system attempted to send an email but encountered an error. Please check SMTP settings or share the link manually.';
      case 'not_configured':
        return 'SMTP email service is not configured. Configure SMTP in settings or share the link manually.';
      default:
        return '';
    }
  }
}
