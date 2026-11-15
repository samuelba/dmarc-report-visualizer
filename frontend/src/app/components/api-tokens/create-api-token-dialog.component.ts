import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MaterialModule } from '../../shared/material.module';
import { MessageComponent } from '../message/message.component';
import { ApiTokenService, CreatedApiToken } from '../../services/api-token.service';

export const EXPIRY_OPTIONS_DAYS = [7, 30, 90, 180, 365];

/** Creates a personal API token and shows it exactly once. */
@Component({
  selector: 'app-create-api-token-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, MessageComponent],
  templateUrl: './create-api-token-dialog.component.html',
  styleUrls: ['./create-api-token-dialog.component.scss'],
})
export class CreateApiTokenDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly apiTokens = inject(ApiTokenService);
  private readonly dialogRef = inject<MatDialogRef<CreateApiTokenDialogComponent, boolean>>(MatDialogRef);
  private readonly snackBar = inject(MatSnackBar);

  readonly expiryOptions = EXPIRY_OPTIONS_DAYS;
  readonly endpoint = this.apiTokens.mcpEndpointUrl();
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    expiresInDays: [90],
    allowRawXml: [false],
  });
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly created = signal<CreatedApiToken | null>(null);

  submit(): void {
    const name = this.form.controls.name.value.trim();
    if (this.form.invalid || name === '' || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.apiTokens.create({ ...this.form.getRawValue(), name }).subscribe({
      next: (created) => {
        this.created.set(created);
        this.saving.set(false);
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.saving.set(false);
      },
    });
  }

  claudeCommand(token: string): string {
    return `claude mcp add --transport http dmarc ${this.endpoint} --header "Authorization: Bearer ${token}"`;
  }

  copy(text: string, what: string): void {
    navigator.clipboard.writeText(text).then(
      () => this.snackBar.open(`${what} copied to clipboard`, 'Close', { duration: 2000 }),
      () => this.snackBar.open('Failed to copy to clipboard', 'Close', { duration: 2000 })
    );
  }

  close(): void {
    this.dialogRef.close(this.created() !== null);
  }
}

function errorMessage(err: unknown): string {
  const message = (err as { error?: { message?: unknown } })?.error?.message;
  if (Array.isArray(message)) {
    return message.join(', ');
  }
  return typeof message === 'string' ? message : 'Could not create the token';
}
