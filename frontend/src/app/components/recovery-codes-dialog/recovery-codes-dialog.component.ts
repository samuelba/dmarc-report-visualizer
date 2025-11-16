import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TotpInputComponent } from '../totp-input/totp-input';
import { MessageComponent } from '../message/message.component';

@Component({
  selector: 'app-recovery-codes-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule, TotpInputComponent, MessageComponent],
  templateUrl: './recovery-codes-dialog.component.html',
  styleUrls: ['./recovery-codes-dialog.component.scss'],
})
export class RecoveryCodesDialogComponent {
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<RecoveryCodesDialogComponent>);

  step: 'verify' | 'display' = 'verify';
  verificationCode = '';
  recoveryCodes: string[] = [];
  acknowledged = false;
  isLoading = false;
  errorMessage = '';

  regenerateCodes(): void {
    if (this.verificationCode.length !== 6) {
      this.errorMessage = 'Please enter a 6-digit code';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.regenerateRecoveryCodes(this.verificationCode).subscribe({
      next: (response) => {
        this.recoveryCodes = response.recoveryCodes;
        this.step = 'display';
        this.isLoading = false;
        this.snackBar.open('Recovery codes regenerated successfully!', 'Close', { duration: 3000 });
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || 'Invalid verification code. Please try again.';
      },
    });
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
