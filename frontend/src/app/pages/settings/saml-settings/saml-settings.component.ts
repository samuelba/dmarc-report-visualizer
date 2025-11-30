import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatRadioModule } from '@angular/material/radio';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { AuthService } from '../../../services/auth.service';
import { UserService } from '../../../services/user.service';
import { MessageComponent } from '../../../components/message/message.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../components/confirm-dialog/confirm-dialog.component';
import { UserRole } from '../../../models/user-role.enum';
import { Router } from '@angular/router';

export interface SamlConfigResponse {
  enabled: boolean;
  configured: boolean;
  spEntityId: string;
  spAcsUrl: string;
  idpEntityId?: string;
  idpSsoUrl?: string;
  hasIdpCertificate: boolean;
  disablePasswordLogin: boolean;
  passwordLoginForceEnabled: boolean;
}

import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-saml-settings',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatRadioModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatChipsModule,
    MessageComponent,
  ],
  templateUrl: './saml-settings.component.html',
  styleUrls: ['./saml-settings.component.scss'],
})
export class SamlSettingsComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  config = signal<SamlConfigResponse | null>(null);
  loading = signal(false);
  uploadMode = signal<'metadata' | 'manual'>('metadata');

  metadataForm: FormGroup;
  manualForm: FormGroup;

  private testWindowCheckInterval: number | null = null;

  constructor() {
    // Metadata upload form
    this.metadataForm = this.fb.group({
      idpMetadataXml: ['', Validators.required],
    });

    // Manual configuration form
    this.manualForm = this.fb.group({
      idpEntityId: ['', Validators.required],
      idpSsoUrl: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
      idpCertificate: ['', Validators.required],
    });
  }

  // UI state
  protected readonly showNoSamlAdminWarning = signal<boolean>(false);
  protected readonly passwordLoginError = signal<string | null>(null);
  hasSamlAdmin = signal(false);
  checkingUsers = signal(false);

  ngOnInit(): void {
    this.loadConfig();
    this.checkSamlAdmins();
  }

  ngOnDestroy(): void {
    // Clean up test window check interval to prevent memory leaks
    if (this.testWindowCheckInterval) {
      clearInterval(this.testWindowCheckInterval);
      this.testWindowCheckInterval = null;
    }
  }

  loadConfig(): void {
    this.loading.set(true);
    this.authService.getSamlConfig().subscribe({
      next: (config) => {
        this.config.set(config);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load SAML configuration:', err);
        this.snackBar.open('Failed to load SAML configuration', 'Close', { duration: 5000 });
        this.loading.set(false);
      },
    });
  }

  checkSamlAdmins(): void {
    this.checkingUsers.set(true);
    this.userService.getAllUsers().subscribe({
      next: (users) => {
        const hasAdmin = users.some((u) => u.role === UserRole.ADMINISTRATOR && u.authProvider === 'saml');
        this.hasSamlAdmin.set(hasAdmin);
        this.showNoSamlAdminWarning.set(!hasAdmin);
        this.checkingUsers.set(false);
      },
      error: (err) => {
        console.error('Failed to check users:', err);
        // Fail safe: assume true so we don't block the UI, but log error
        this.hasSamlAdmin.set(true);
        this.checkingUsers.set(false);
      },
    });
  }

  setUploadMode(mode: 'metadata' | 'manual'): void {
    this.uploadMode.set(mode);
  }

  copyToClipboard(text: string, label: string): void {
    navigator.clipboard.writeText(text).then(
      () => {
        this.snackBar.open(`${label} copied to clipboard`, 'Close', { duration: 3000 });
      },
      (err) => {
        console.error('Failed to copy to clipboard:', err);
        this.snackBar.open('Failed to copy to clipboard', 'Close', { duration: 3000 });
      }
    );
  }

  downloadMetadata(): void {
    this.loading.set(true);
    this.authService.downloadSamlMetadata().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sp-metadata.xml';
        link.click();
        window.URL.revokeObjectURL(url);
        this.loading.set(false);
        this.snackBar.open('SP metadata downloaded', 'Close', { duration: 3000 });
      },
      error: (err) => {
        console.error('Failed to download metadata:', err);
        this.snackBar.open('Failed to download metadata', 'Close', { duration: 5000 });
        this.loading.set(false);
      },
    });
  }

  onMetadataFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result as string;
      this.metadataForm.patchValue({ idpMetadataXml: content });
    };

    reader.onerror = () => {
      this.snackBar.open('Failed to read file', 'Close', { duration: 5000 });
    };

    reader.readAsText(file);
  }

  submitMetadata(): void {
    if (this.metadataForm.invalid) {
      this.snackBar.open('Please upload a metadata file', 'Close', { duration: 3000 });
      return;
    }

    this.loading.set(true);
    const configData = {
      idpMetadataXml: this.metadataForm.value.idpMetadataXml,
    };

    this.authService.updateSamlConfig(configData).subscribe({
      next: (_response) => {
        this.snackBar.open('SAML configuration updated successfully', 'Close', { duration: 3000 });
        this.loadConfig();
        this.metadataForm.reset();
      },
      error: (err) => {
        console.error('Failed to update SAML configuration:', err);
        const errorMessage = err.error?.message || 'Failed to update SAML configuration';
        this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
        this.loading.set(false);
      },
    });
  }

  submitManualConfig(): void {
    if (this.manualForm.invalid) {
      this.snackBar.open('Please fill in all required fields', 'Close', { duration: 3000 });
      return;
    }

    this.loading.set(true);
    const configData = {
      idpEntityId: this.manualForm.value.idpEntityId,
      idpSsoUrl: this.manualForm.value.idpSsoUrl,
      idpCertificate: this.manualForm.value.idpCertificate,
    };

    this.authService.updateSamlConfig(configData).subscribe({
      next: (_response) => {
        this.snackBar.open('SAML configuration updated successfully', 'Close', { duration: 3000 });
        this.loadConfig();
        this.manualForm.reset();
      },
      error: (err) => {
        console.error('Failed to update SAML configuration:', err);
        const errorMessage = err.error?.message || 'Failed to update SAML configuration';
        this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
        this.loading.set(false);
      },
    });
  }

  toggleSaml(event: any): void {
    const enabled = event.checked;
    const currentConfig = this.config();

    if (!currentConfig?.configured) {
      this.snackBar.open('Please configure SAML before enabling it', 'Close', { duration: 3000 });
      event.source.checked = false;
      return;
    }

    if (!enabled) {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: 'Disable SAML Authentication',
          message:
            'Are you sure you want to disable SAML authentication? Users will not be able to sign in with SSO until it is re-enabled.',
          confirmText: 'Disable',
          cancelText: 'Cancel',
          confirmColor: 'warn',
        } as ConfirmDialogData,
      });

      dialogRef.afterClosed().subscribe((confirmed) => {
        if (!confirmed) {
          event.source.checked = true;
          return;
        }

        this.performSamlToggle(enabled, event);
      });
      return;
    }

    this.performSamlToggle(enabled, event);
  }

  private performSamlToggle(enabled: boolean, event: any): void {
    this.loading.set(true);
    const action = enabled ? this.authService.enableSaml() : this.authService.disableSaml();

    action.subscribe({
      next: () => {
        this.snackBar.open(`SAML authentication ${enabled ? 'enabled' : 'disabled'}`, 'Close', { duration: 3000 });
        this.loadConfig();
      },
      error: (err) => {
        console.error('Failed to toggle SAML:', err);
        this.snackBar.open('Failed to update SAML status', 'Close', { duration: 5000 });
        event.source.checked = !enabled;
        this.loading.set(false);
      },
    });
  }

  testSamlLogin(): void {
    const currentConfig = this.config();

    if (!currentConfig?.configured) {
      this.snackBar.open('Please configure SAML before testing', 'Close', { duration: 3000 });
      return;
    }

    // Clear any existing interval before starting a new one
    if (this.testWindowCheckInterval) {
      clearInterval(this.testWindowCheckInterval);
      this.testWindowCheckInterval = null;
    }

    // Check if access token is expired
    const accessToken = this.getAccessTokenFromCookie();

    if (!accessToken || this.isTokenExpired(accessToken)) {
      // Token is expired, refresh it first
      this.authService.refreshToken().subscribe({
        next: () => {
          // Token refreshed successfully, proceed with test
          this.initiateSamlTestFlow();
        },
        error: (err) => {
          // Handle refresh failure
          this.handleAuthError(err, 'Failed to refresh session. Please try again.');
        },
      });
    } else {
      // Token is valid, proceed with test
      this.initiateSamlTestFlow();
    }
  }

  /**
   * Initiate SAML test flow
   * Called after token validation/refresh
   */
  private initiateSamlTestFlow(): void {
    this.authService.initiateSamlTest().subscribe({
      next: (result) => {
        if (!result.success) {
          this.snackBar.open(result.message, 'Close', { duration: 5000 });
          return;
        }

        // Open test login URL in new window
        const testWindow = window.open(
          result.testLoginUrl,
          'saml-test',
          'width=800,height=600,menubar=no,toolbar=no,location=no'
        );

        if (!testWindow) {
          this.snackBar.open('Please allow pop-ups to test SAML login', 'Close', { duration: 5000 });
          return;
        }

        this.snackBar.open('SAML test login opened in new window', 'Close', { duration: 3000 });

        // Listen for the test window to close or complete
        this.testWindowCheckInterval = setInterval(() => {
          if (testWindow.closed) {
            if (this.testWindowCheckInterval) {
              clearInterval(this.testWindowCheckInterval);
              this.testWindowCheckInterval = null;
            }
            this.snackBar.open('SAML test window closed', 'Close', { duration: 3000 });
          }
        }, 1000);
      },
      error: (err) => {
        // Handle errors from initiate endpoint
        this.handleAuthError(err, 'Failed to initiate SAML test');
      },
    });
  }

  togglePasswordLogin(event: any): void {
    const disabled = event.checked;
    const currentConfig = this.config();

    // Only prevent disabling password login when SAML is not enabled
    // Allow enabling password login at any time (recovery scenario)
    if (disabled && !currentConfig?.enabled) {
      this.snackBar.open('SAML must be enabled before disabling password login', 'Close', { duration: 3000 });
      event.source.checked = false;
      return;
    }

    if (disabled) {
      // Double check just in case, though UI should be disabled
      if (!this.hasSamlAdmin()) {
        this.snackBar.open('Cannot disable password login. At least one SAML administrator is required.', 'Close', {
          duration: 5000,
        });
        event.source.checked = false;
        return;
      }

      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: 'Disable Password Login',
          message:
            'Warning: Disabling password login will require all users to authenticate via SSO. Ensure SAML is properly configured and tested before proceeding.\n\nAre you sure you want to continue?',
          confirmText: 'Disable',
          cancelText: 'Cancel',
          confirmColor: 'warn',
        } as ConfirmDialogData,
      });

      dialogRef.afterClosed().subscribe((confirmed) => {
        if (!confirmed) {
          event.source.checked = false;
          return;
        }

        this.performPasswordLoginToggle(disabled, event);
      });
      return;
    }

    this.performPasswordLoginToggle(disabled, event);
  }

  private performPasswordLoginToggle(disabled: boolean, event: any): void {
    this.loading.set(true);
    this.passwordLoginError.set(null); // Clear previous errors

    const action = disabled ? this.authService.disablePasswordLogin() : this.authService.enablePasswordLogin();

    action.subscribe({
      next: () => {
        this.snackBar.open(`Password login ${disabled ? 'disabled' : 'enabled'}`, 'Close', { duration: 3000 });
        this.loadConfig();
      },
      error: (err) => {
        console.error('Failed to toggle password login:', err);
        const errorMessage = err.error?.message || 'Failed to update password login status';

        // Set error message to be displayed in the UI
        this.passwordLoginError.set(errorMessage);

        // Revert the toggle state
        event.source.checked = !disabled;
        this.loading.set(false);
      },
    });
  }

  /**
   * Get access token from cookie
   * @returns Access token or null if not found
   */
  private getAccessTokenFromCookie(): string | null {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.trim().split('=');
      if (name === 'accessToken') {
        return valueParts.join('=');
      }
    }
    return null;
  }

  /**
   * Check if JWT token is expired or will expire soon
   * @param token JWT token
   * @returns True if expired or expires within 60 seconds
   */
  private isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(window.atob(token.split('.')[1]));

      // If no exp claim exists, consider token expired
      if (!payload.exp || typeof payload.exp !== 'number') {
        return true;
      }

      const exp = payload.exp * 1000; // Convert to milliseconds
      const bufferMs = 60000; // 60 second buffer for clock skew and race conditions
      return Date.now() >= exp - bufferMs;
    } catch {
      return true; // If we can't parse it, consider it expired
    }
  }

  /**
   * Handle authentication errors consistently
   * @param err Error object from HTTP request
   * @param defaultMessage Default error message if none provided
   */
  private handleAuthError(err: any, defaultMessage: string): void {
    if (err.status === 401) {
      this.snackBar.open('Session expired. Please log in again.', 'Close', { duration: 5000 });
      this.router.navigate(['/login']);
    } else if (err.status === 403) {
      this.snackBar.open('Administrator access required to test SAML', 'Close', { duration: 5000 });
    } else {
      const errorMessage = err.error?.message || defaultMessage;
      this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
    }
  }
}
