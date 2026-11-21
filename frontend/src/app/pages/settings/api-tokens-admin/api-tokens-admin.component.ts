import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MaterialModule } from '../../../shared/material.module';
import { AdminApiToken, ApiTokenService, tokenStatus } from '../../../services/api-token.service';
import { ConfirmDialogComponent } from '../../../components/confirm-dialog/confirm-dialog.component';

/** All users' MCP API tokens, for administrators. */
@Component({
  selector: 'app-api-tokens-admin',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './api-tokens-admin.component.html',
  styleUrls: ['./api-tokens-admin.component.scss'],
})
export class ApiTokensAdminComponent implements OnInit {
  private readonly apiTokens = inject(ApiTokenService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly tokens = signal<AdminApiToken[]>([]);
  readonly loading = signal(true);
  readonly columns = ['user', 'name', 'prefix', 'access', 'lastUsed', 'expires', 'status', 'actions'];
  readonly status = tokenStatus;

  ngOnInit(): void {
    this.load();
  }

  revoke(token: AdminApiToken): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        width: '480px',
        data: {
          title: 'Revoke API token',
          message: `"${token.name}" of ${token.userEmail ?? 'a deleted user'} stops working immediately.`,
          confirmText: 'Revoke',
          confirmColor: 'warn',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.apiTokens.revokeAny(token.id).subscribe({
          next: () => {
            this.notify('Token revoked');
            this.load();
          },
          error: () => this.notify('Could not revoke the token', 5000),
        });
      });
  }

  private load(): void {
    this.loading.set(true);
    this.apiTokens.listAll().subscribe({
      next: (tokens) => {
        this.tokens.set(tokens ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.notify('Failed to load API tokens', 5000);
        this.loading.set(false);
      },
    });
  }

  private notify(message: string, duration = 3000): void {
    this.snackBar.open(message, 'Close', { duration });
  }
}
