import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { MatDialogRef } from '@angular/material/dialog';
import { AuthService, TotpSetupResponse } from '../../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TotpInputComponent } from '../totp-input/totp-input';
import { MessageComponent } from '../message/message.component';

type SetupStep = 'scan' | 'verify' | 'recovery';

@Component({
  selector: 'app-totp-setup-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule, TotpInputComponent, MessageComponent],
  templateUrl: './totp-setup-dialog.component.html',
  styleUrls: ['./totp-setup-dialog.component.scss'],
})
export class TotpSetupDialogComponent {
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<TotpSetupDialogComponent>);

  step: SetupStep = 'scan';
  qrCodeUrl = '';
  secret = '';
  otpauthUrl = '';
  verificationCode = '';
  recoveryCodes: string[] = [];
  acknowledged = false;
  isLoading = false;
  errorMessage = '';

  // Compatible authenticator apps
  authenticatorApps = ['Google Authenticator', 'Microsoft Authenticator', 'Authy'];

  ngOnInit(): void {
    this.loadTotpSetup();
  }

  private loadTotpSetup(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.authService.setupTotp().subscribe({
      next: (response: TotpSetupResponse) => {
        this.secret = response.secret;
        this.qrCodeUrl = response.qrCodeUrl;
        this.otpauthUrl = response.otpauthUrl;
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || 'Failed to generate TOTP secret. Please try again.';
        this.snackBar.open(this.errorMessage, 'Close', { duration: 5000 });
      },
    });
  }

  goToVerify(): void {
    if (!this.secret || !this.qrCodeUrl) {
      this.snackBar.open('Please wait for the QR code to load', 'Close', { duration: 3000 });
      return;
    }
    this.step = 'verify';
    this.errorMessage = '';
  }

  goBackToScan(): void {
    this.step = 'scan';
    this.verificationCode = '';
    this.errorMessage = '';
  }

  verifyAndEnable(): void {
    if (this.verificationCode.length !== 6) {
      this.errorMessage = 'Please enter a 6-digit code';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.enableTotp(this.secret, this.verificationCode).subscribe({
      next: (response) => {
        this.recoveryCodes = response.recoveryCodes;
        this.step = 'recovery';
        this.isLoading = false;
        this.snackBar.open('Two-factor authentication enabled successfully!', 'Close', { duration: 3000 });
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || 'Invalid verification code. Please try again.';
      },
    });
  }

  copySecretToClipboard(): void {
    navigator.clipboard.writeText(this.secret).then(
      () => {
        this.snackBar.open('Secret copied to clipboard', 'Close', { duration: 2000 });
      },
      () => {
        this.snackBar.open('Failed to copy to clipboard', 'Close', { duration: 2000 });
      }
    );
  }

  copyRecoveryCodesToClipboard(): void {
    const codesText = this.recoveryCodes.join('\n');
    navigator.clipboard.writeText(codesText).then(
      () => {
        this.snackBar.open('Recovery codes copied to clipboard', 'Close', { duration: 2000 });
      },
      () => {
        this.snackBar.open('Failed to copy to clipboard', 'Close', { duration: 2000 });
      }
    );
  }

  downloadCodes(): void {
    const codesText = this.recoveryCodes.join('\n');
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'totp-recovery-codes.txt';
    link.click();
    window.URL.revokeObjectURL(url);
    this.snackBar.open('Recovery codes downloaded', 'Close', { duration: 2000 });
  }

  complete(): void {
    if (!this.acknowledged) {
      this.snackBar.open('Please acknowledge that you have saved your recovery codes', 'Close', {
        duration: 3000,
      });
      return;
    }
    this.dialogRef.close(true);
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  get isVerificationCodeValid(): boolean {
    return this.verificationCode.length === 6 && /^\d{6}$/.test(this.verificationCode);
  }
}
