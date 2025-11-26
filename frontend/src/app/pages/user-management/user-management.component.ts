import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UserService, UserResponse, InviteToken } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../components/confirm-dialog/confirm-dialog.component';
import { InviteUserDialogComponent } from '../../components/invite-user-dialog/invite-user-dialog.component';
import { UserRole } from '../../models/user-role.enum';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    MatSelectModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.scss'],
})
export class UserManagementComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  users = signal<UserResponse[]>([]);
  invites = signal<InviteToken[]>([]);
  currentUser = signal<UserResponse | null>(null);
  loading = signal(false);
  invitesLoading = signal(false);
  passwordLoginAllowed = signal(true);

  userDisplayedColumns = ['email', 'role', 'authProvider', 'createdAt', 'actions'];
  inviteDisplayedColumns = ['email', 'role', 'expiresAt', 'actions'];

  readonly UserRole = UserRole;

  ngOnInit(): void {
    this.loadUsers();
    this.loadInvites();
    this.loadCurrentUser();
    this.checkPasswordLoginStatus();
  }

  checkPasswordLoginStatus(): void {
    this.authService.getSamlAndLoginStatus().subscribe({
      next: (status) => {
        this.passwordLoginAllowed.set(status.passwordLoginAllowed);
      },
      error: (err) => {
        console.error('Failed to check password login status:', err);
        // Default to showing invite button on error
        this.passwordLoginAllowed.set(true);
      },
    });
  }

  loadUsers(): void {
    this.loading.set(true);
    this.userService.getAllUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Failed to load users:', err);
        this.snackBar.open('Failed to load users', 'Close', { duration: 5000 });
        this.loading.set(false);
      },
    });
  }

  loadInvites(): void {
    this.invitesLoading.set(true);
    this.userService.getActiveInvites().subscribe({
      next: (invites) => {
        this.invites.set(invites);
        this.invitesLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load invites:', err);
        this.snackBar.open('Failed to load invites', 'Close', { duration: 5000 });
        this.invitesLoading.set(false);
      },
    });
  }

  loadCurrentUser(): void {
    this.authService.getCurrentUser().subscribe({
      next: (user) => {
        if (user) {
          // Find the full user details from the users list
          const fullUser = this.users().find((u) => u.id === user.id);
          if (fullUser) {
            this.currentUser.set(fullUser);
          }
        }
      },
    });
  }

  openInviteDialog(): void {
    const dialogRef = this.dialog.open(InviteUserDialogComponent, {
      width: '550px',
      disableClose: false,
    });

    dialogRef.afterClosed().subscribe((inviteCreated) => {
      if (inviteCreated) {
        // Reload invites list if an invite was created
        this.loadInvites();
      }
    });
  }

  changeUserRole(user: UserResponse, newRole: UserRole): void {
    // Store the original role to restore if user cancels
    const originalRole = user.role;

    // Immediately restore the original role in the dropdown to prevent visual change
    // We'll update it again if the user confirms
    this.updateUserRoleInSignal(user.id, originalRole);

    // Prevent demoting the last administrator to user
    if (newRole === UserRole.USER && user.role === UserRole.ADMINISTRATOR) {
      // Check if this user is the last local admin
      if (user.authProvider === 'local') {
        const localAdminCount = this.users().filter(
          (u) => u.role === UserRole.ADMINISTRATOR && u.authProvider === 'local'
        ).length;

        if (localAdminCount === 1) {
          this.snackBar.open(
            'Cannot demote the last local administrator. At least one local administrator must exist.',
            'Close',
            { duration: 5000 }
          );
          return;
        }
      }
    }
    const roleLabel = newRole === UserRole.ADMINISTRATOR ? 'Administrator' : 'User';
    const dialogData: ConfirmDialogData = {
      title: 'Change User Role',
      message: `Are you sure you want to change ${user.email}'s role to ${roleLabel}?\n\nThe user will need to log in again for the changes to take effect.`,
      confirmText: 'Change Role',
      cancelText: 'Cancel',
      confirmColor: 'primary',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: dialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        // Already restored above, nothing to do
        return;
      }

      // Update the dropdown to show the new role immediately (optimistic update)
      this.updateUserRoleInSignal(user.id, newRole);

      this.userService.updateUserRole(user.id, newRole).subscribe({
        next: () => {
          this.snackBar.open('User role updated successfully', 'Close', { duration: 3000 });
          this.loadUsers();
        },
        error: (err) => {
          console.error('Failed to update user role:', err);
          // Restore original role in dropdown on error
          this.updateUserRoleInSignal(user.id, originalRole);
          const errorMessage = err.error?.message || 'Failed to update user role';
          this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
        },
      });
    });
  }

  private updateUserRoleInSignal(userId: string, role: UserRole): void {
    this.users.update((users) => users.map((user) => (user.id === userId ? { ...user, role } : user)));
  }

  deleteUser(user: UserResponse): void {
    // Check if this is the last admin
    if (this.isLastAdmin(user)) {
      this.snackBar.open(
        'Cannot delete the last local administrator. At least one local administrator must exist.',
        'Close',
        {
          duration: 5000,
        }
      );
      return;
    }

    const dialogData: ConfirmDialogData = {
      title: 'Delete User',
      message: `Are you sure you want to delete ${user.email}?\n\nThis action cannot be undone and will remove all associated data.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'warn',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: dialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      this.userService.deleteUser(user.id).subscribe({
        next: () => {
          this.snackBar.open('User deleted successfully', 'Close', { duration: 3000 });
          this.loadUsers();
        },
        error: (err) => {
          console.error('Failed to delete user:', err);
          const errorMessage = err.error?.message || 'Failed to delete user';
          this.snackBar.open(errorMessage, 'Close', { duration: 5000 });
        },
      });
    });
  }

  revokeInvite(invite: InviteToken): void {
    const dialogData: ConfirmDialogData = {
      title: 'Revoke Invitation',
      message: `Are you sure you want to revoke the invitation for ${invite.email}?\n\nThe invite link will no longer work.`,
      confirmText: 'Revoke',
      cancelText: 'Cancel',
      confirmColor: 'warn',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: dialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      this.userService.revokeInvite(invite.id).subscribe({
        next: () => {
          this.snackBar.open('Invite revoked successfully', 'Close', { duration: 3000 });
          this.loadInvites();
        },
        error: (err) => {
          console.error('Failed to revoke invite:', err);
          this.snackBar.open('Failed to revoke invite', 'Close', { duration: 5000 });
        },
      });
    });
  }

  canModifyUser(user: UserResponse): boolean {
    // Can't modify yourself
    const current = this.currentUser();
    if (current && current.id === user.id) {
      return false;
    }

    // Can't modify last admin
    if (this.isLastAdmin(user)) {
      return false;
    }

    return true;
  }

  isLastAdmin(user: UserResponse): boolean {
    if (user.role !== UserRole.ADMINISTRATOR) {
      return false;
    }

    // Only check for local administrators
    if (user.authProvider !== 'local') {
      return false;
    }

    const localAdminCount = this.users().filter(
      (u) => u.role === UserRole.ADMINISTRATOR && u.authProvider === 'local'
    ).length;
    return localAdminCount === 1;
  }

  getRoleBadgeColor(role: UserRole): string {
    return role === UserRole.ADMINISTRATOR ? 'primary' : 'accent';
  }

  getRoleLabel(role: UserRole): string {
    return role === UserRole.ADMINISTRATOR ? 'Administrator' : 'User';
  }

  formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }

  isExpiringSoon(expiresAt: Date | string): boolean {
    const expires = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
    const now = new Date();
    const hoursUntilExpiry = (expires.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilExpiry < 24 && hoursUntilExpiry > 0;
  }
}
