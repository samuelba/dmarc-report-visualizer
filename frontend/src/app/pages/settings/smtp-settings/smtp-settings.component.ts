import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SmtpSettingsService, SendEmailResult } from './smtp-settings.service';
import { MessageComponent } from '../../../components/message/message.component';
import { ConfirmDialogComponent } from '../../../components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-smtp-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MessageComponent,
  ],
  templateUrl: './smtp-settings.component.html',
  styleUrls: ['./smtp-settings.component.scss'],
})
export class SmtpSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly smtpService = inject(SmtpSettingsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  smtpForm!: FormGroup;
  loading = signal(false);
  saving = signal(false);
  testing = signal(false);
  testResult = signal<SendEmailResult | null>(null);
  testEmail = signal('');
  configured = signal(false);
  hidePassword = signal(true);

  securityModes = [
    { value: 'none', label: 'None (Unencrypted)' },
    { value: 'tls', label: 'TLS/SSL' },
    { value: 'starttls', label: 'STARTTLS' },
  ];

  ngOnInit() {
    this.initForm();
    this.loadConfig();
  }

  private initForm() {
    this.smtpForm = this.fb.group({
      host: ['', [Validators.required]],
      port: ['', [Validators.required, Validators.min(1), Validators.max(65535)]],
      securityMode: ['starttls', [Validators.required]],
      username: [''],
      password: [''],
      fromEmail: ['', [Validators.required, Validators.email]],
      fromName: ['', [Validators.required]],
      replyToEmail: ['', [Validators.email]],
    });

    // Auto-suggest port based on security mode
    this.smtpForm.get('securityMode')?.valueChanges.subscribe((mode) => {
      this.onSecurityModeChange(mode);
    });
  }

  private loadConfig() {
    this.loading.set(true);
    this.smtpService.getConfig().subscribe({
      next: (config) => {
        this.configured.set(config.configured);
        if (config.configured) {
          this.smtpForm.patchValue({
            host: config.host,
            port: config.port,
            securityMode: config.securityMode,
            username: config.username,
            password: '', // Never populate password
            fromEmail: config.fromEmail,
            fromName: config.fromName,
            replyToEmail: config.replyToEmail,
          });
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load SMTP config:', err);
        this.snackBar.open('Failed to load SMTP configuration', 'Close', { duration: 5000 });
        this.loading.set(false);
      },
    });
  }

  onSecurityModeChange(mode: string) {
    const portControl = this.smtpForm.get('port');
    const currentPort = portControl?.value;

    // Only auto-suggest if port is empty or is a default port
    if (!currentPort || currentPort === 587 || currentPort === 465 || currentPort === 25) {
      if (mode === 'tls') {
        portControl?.setValue(465);
      } else if (mode === 'starttls') {
        portControl?.setValue(587);
      } else if (mode === 'none') {
        portControl?.setValue(25);
      }
    }
  }

  saveConfig() {
    if (this.smtpForm.invalid) {
      this.smtpForm.markAllAsTouched();
      this.snackBar.open('Please fill in all required fields', 'Close', { duration: 3000 });
      return;
    }

    this.saving.set(true);
    const formValue = this.smtpForm.value;

    // Only include password if it's been changed (not empty)
    const config: any = {
      host: formValue.host,
      port: Number(formValue.port),
      securityMode: formValue.securityMode,
      username: formValue.username || undefined,
      fromEmail: formValue.fromEmail,
      fromName: formValue.fromName,
      replyToEmail: formValue.replyToEmail || undefined,
    };

    // Only include password if user entered one
    if (formValue.password) {
      config.password = formValue.password;
    }

    this.smtpService.updateConfig(config).subscribe({
      next: (_response) => {
        this.configured.set(true);
        this.snackBar.open('SMTP configuration saved successfully', 'Close', { duration: 3000 });
        this.saving.set(false);
        // Clear password field after save
        this.smtpForm.patchValue({ password: '' });
      },
      error: (err) => {
        console.error('Failed to save SMTP config:', err);
        this.snackBar.open('Failed to save SMTP configuration', 'Close', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }

  sendTestEmail() {
    const email = this.testEmail();
    if (!email || !this.isValidEmail(email)) {
      this.snackBar.open('Please enter a valid email address', 'Close', { duration: 3000 });
      return;
    }

    this.testing.set(true);
    this.testResult.set(null);

    this.smtpService.sendTestEmail(email).subscribe({
      next: (result) => {
        this.testResult.set(result);
        this.testing.set(false);
        if (result.success) {
          this.snackBar.open('Test email sent successfully!', 'Close', { duration: 3000 });
        } else {
          this.snackBar.open('Test email failed to send', 'Close', { duration: 5000 });
        }
      },
      error: (err) => {
        console.error('Failed to send test email:', err);
        this.testResult.set({
          success: false,
          error: err.error?.message || 'Failed to send test email',
        });
        this.testing.set(false);
        this.snackBar.open('Failed to send test email', 'Close', { duration: 5000 });
      },
    });
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  getErrorMessage(fieldName: string): string {
    const control = this.smtpForm.get(fieldName);
    if (control?.hasError('required')) {
      return 'This field is required';
    }
    if (control?.hasError('email')) {
      return 'Please enter a valid email address';
    }
    if (control?.hasError('min')) {
      return 'Port must be at least 1';
    }
    if (control?.hasError('max')) {
      return 'Port must be at most 65535';
    }
    return '';
  }

  resetConfig() {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Reset SMTP Configuration',
        message:
          'Are you sure you want to reset the SMTP configuration? This will remove all settings and cannot be undone.',
        confirmText: 'Reset',
        cancelText: 'Cancel',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.loading.set(true);
        this.smtpService.deleteConfig().subscribe({
          next: () => {
            this.configured.set(false);
            this.testResult.set(null);
            this.smtpForm.reset({
              host: '',
              port: '',
              securityMode: 'starttls',
              username: '',
              password: '',
              fromEmail: '',
              fromName: '',
              replyToEmail: '',
            });
            this.snackBar.open('SMTP configuration reset successfully', 'Close', { duration: 3000 });
            this.loading.set(false);
          },
          error: (err) => {
            console.error('Failed to reset SMTP config:', err);
            this.snackBar.open('Failed to reset SMTP configuration', 'Close', { duration: 5000 });
            this.loading.set(false);
          },
        });
      }
    });
  }
}
