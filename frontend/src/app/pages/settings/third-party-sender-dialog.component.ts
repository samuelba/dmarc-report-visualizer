import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  ApiService,
  ThirdPartySender,
  CreateThirdPartySenderDto,
  UpdateThirdPartySenderDto,
} from '../../services/api.service';

export interface ThirdPartySenderDialogData {
  mode: 'create' | 'edit';
  sender?: ThirdPartySender;
}

@Component({
  selector: 'app-third-party-sender-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './third-party-sender-dialog.component.html',
  styleUrls: ['./third-party-sender-dialog.component.scss'],
})
export class ThirdPartySenderDialogComponent implements OnInit {
  readonly dialogRef = inject(MatDialogRef<ThirdPartySenderDialogComponent>);
  readonly data = inject<ThirdPartySenderDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(ApiService);
  private readonly snackBar = inject(MatSnackBar);

  formData: {
    name: string;
    description?: string;
    dkimPattern?: string;
    spfPattern?: string;
    enabled: boolean;
  } = {
    name: '',
    description: '',
    dkimPattern: '',
    spfPattern: '',
    enabled: true,
  };

  dkimError = signal<string | null>(null);
  spfError = signal<string | null>(null);
  saving = signal(false);

  ngOnInit() {
    if (this.data.mode === 'edit' && this.data.sender) {
      const sender = this.data.sender;
      this.formData = {
        name: sender.name,
        description: sender.description || '',
        dkimPattern: sender.dkimPattern || '',
        spfPattern: sender.spfPattern || '',
        enabled: sender.enabled,
      };
    }
  }

  validateRegex(type: 'dkim' | 'spf') {
    const pattern = type === 'dkim' ? this.formData.dkimPattern : this.formData.spfPattern;

    if (!pattern || pattern.trim() === '') {
      if (type === 'dkim') this.dkimError.set(null);
      else this.spfError.set(null);
      return;
    }

    try {
      new RegExp(pattern);
      if (type === 'dkim') this.dkimError.set(null);
      else this.spfError.set(null);
    } catch (error) {
      const errorMsg = 'Invalid regex pattern';
      if (type === 'dkim') this.dkimError.set(errorMsg);
      else this.spfError.set(errorMsg);
    }
  }

  isValid(): boolean {
    return this.formData.name.trim() !== '' && !this.dkimError() && !this.spfError();
  }

  cancel() {
    this.dialogRef.close(false);
  }

  save() {
    if (!this.isValid()) return;

    // Validate regex patterns one more time
    this.validateRegex('dkim');
    this.validateRegex('spf');

    if (this.dkimError() || this.spfError()) {
      this.snackBar.open('Please fix validation errors', 'Close', { duration: 3000 });
      return;
    }

    this.saving.set(true);

    const dto = {
      name: this.formData.name.trim(),
      description: this.formData.description?.trim() || undefined,
      dkimPattern: this.formData.dkimPattern?.trim() || undefined,
      spfPattern: this.formData.spfPattern?.trim() || undefined,
      enabled: this.formData.enabled,
    };

    const request =
      this.data.mode === 'create'
        ? this.api.createThirdPartySender(dto as CreateThirdPartySenderDto)
        : this.api.updateThirdPartySender(this.data.sender!.id, dto as UpdateThirdPartySenderDto);

    request.subscribe({
      next: () => {
        this.dialogRef.close(true);
      },
      error: (err) => {
        console.error('Failed to save third-party sender:', err);
        const message = err.error?.message || 'Failed to save third-party sender';
        this.snackBar.open(message, 'Close', { duration: 5000 });
        this.saving.set(false);
      },
    });
  }
}
