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
import { ApiService, ThirdPartySender, CreateThirdPartySenderDto, UpdateThirdPartySenderDto } from '../../services/api.service';

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
  template: `
    <h2 mat-dialog-title>
      <mat-icon>{{ data.mode === 'create' ? 'add' : 'edit' }}</mat-icon>
      {{ data.mode === 'create' ? 'Add' : 'Edit' }} Third-Party Sender
    </h2>

    <mat-dialog-content>
      <div class="form-container">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Name</mat-label>
          <input matInput [(ngModel)]="formData.name" placeholder="e.g., SendGrid, Mailgun" required>
          <mat-hint>A descriptive name for this sender</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description</mat-label>
          <textarea 
            matInput 
            [(ngModel)]="formData.description" 
            placeholder="Optional description..."
            rows="2">
          </textarea>
          <mat-hint>When and why this sender is used</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>DKIM Pattern (Regex)</mat-label>
          <input 
            matInput 
            [(ngModel)]="formData.dkimPattern" 
            placeholder="e.g., .*\\.sendgrid\\.net$"
            (blur)="validateRegex('dkim')">
          <mat-icon matSuffix matTooltip="Regular expression to match DKIM domains">help</mat-icon>
          <mat-hint>Regex pattern to match DKIM authentication domains</mat-hint>
          @if (dkimError()) {
            <mat-error>{{ dkimError() }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>SPF Pattern (Regex)</mat-label>
          <input 
            matInput 
            [(ngModel)]="formData.spfPattern" 
            placeholder="e.g., .*\\.sendgrid\\.net$"
            (blur)="validateRegex('spf')">
          <mat-icon matSuffix matTooltip="Regular expression to match SPF domains">help</mat-icon>
          <mat-hint>Regex pattern to match SPF authentication domains</mat-hint>
          @if (spfError()) {
            <mat-error>{{ spfError() }}</mat-error>
          }
        </mat-form-field>

        <div class="toggle-container">
          <mat-slide-toggle [(ngModel)]="formData.enabled" color="primary">
            Enabled
          </mat-slide-toggle>
          <span class="toggle-hint">Active rules will be applied during forwarding detection</span>
        </div>

        <div class="help-section">
          <strong>💡 Pattern Examples:</strong>
          <ul>
            <li><code>.*\\.sendgrid\\.net$</code> - Matches any sendgrid.net subdomain</li>
            <li><code>^mail\\..*\\.com$</code> - Matches mail.*.com</li>
            <li><code>.*(sendgrid|mailgun)\\..*</code> - Matches domains containing sendgrid or mailgun</li>
          </ul>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton="text" (click)="cancel()">Cancel</button>
      <button 
        matButton="filled"
        color="primary" 
        (click)="save()"
        [disabled]="!isValid() || saving()">
        @if (saving()) {
          Saving...
        } @else {
          {{ data.mode === 'create' ? 'Create' : 'Update' }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .form-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem 0;
      min-width: 500px;
    }

    .full-width {
      width: 100%;
    }

    .toggle-container {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.5rem 0;

      .toggle-hint {
        font-size: 0.85rem;
        color: var(--mdc-theme-text-secondary-on-background, #666);
        margin-left: 0.5rem;
      }
    }

    .help-section {
      background-color: rgba(0, 0, 0, 0.04);
      padding: 1rem;
      border-radius: 4px;
      margin-top: 1rem;

      strong {
        display: block;
        margin-bottom: 0.5rem;
      }

      ul {
        margin: 0.5rem 0 0 0;
        padding-left: 1.5rem;
        font-size: 0.9rem;
      }

      code {
        background-color: rgba(0, 0, 0, 0.06);
        padding: 0.1rem 0.3rem;
        border-radius: 2px;
        font-family: 'Courier New', monospace;
      }
    }

    // Dark theme support
    @media (prefers-color-scheme: dark) {
      .help-section {
        background-color: rgba(255, 255, 255, 0.05);

        code {
          background-color: rgba(255, 255, 255, 0.08);
        }
      }
    }

    mat-dialog-actions {
      padding: 1rem 1.5rem;
      margin: 0;
    }
  `],
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
    return (
      this.formData.name.trim() !== '' &&
      !this.dkimError() &&
      !this.spfError()
    );
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

    const request = this.data.mode === 'create'
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
