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
  selector: 'app-totp-disable-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule, TotpInputComponent, MessageComponent],
  templateUrl: './totp-disable-dialog.component.html',
  styleUrls: ['./totp-disable-dialog.component.scss'],
})
export class TotpDisableDialogComponent {
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<TotpDisableDialogComponent>);

  password = '';
  totpCode = '';
  isLoading = false;
  errorMessage = '';
  showPassword = false;

  disableTotp(): void {
    if (!this.isValid) {
      this.errorMessage = 'Please fill in all fields';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.disableTotp(this.password, this.totpCode).subscribe({
      next: () => {
        this.isLoading = false;
        this.snackBar.open('Two-factor authentication disabled successfully', 'Close', {
          duration: 3000,
        });
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || 'Failed to disable 2FA. Please check your credentials.';
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  get isValid(): boolean {
    return this.password.length > 0 && this.totpCode.length === 6 && /^\d{6}$/.test(this.totpCode);
  }
}
