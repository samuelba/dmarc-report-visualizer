import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserService, InviteResponse } from '../../services/user.service';
import { MessageComponent } from '../message/message.component';
import { UserRole } from '../../models/user-role.enum';

@Component({
  selector: 'app-invite-user-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MaterialModule, MessageComponent],
  templateUrl: './invite-user-dialog.component.html',
  styleUrls: ['./invite-user-dialog.component.scss'],
})
export class InviteUserDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<InviteUserDialogComponent>);

  inviteForm: FormGroup;
  generatedInvite: InviteResponse | null = null;
  isLoading = false;
  errorMessage = '';

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
        this.snackBar.open('Invite created successfully!', 'Close', { duration: 3000 });
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || 'Failed to create invite. Please try again.';
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
}
