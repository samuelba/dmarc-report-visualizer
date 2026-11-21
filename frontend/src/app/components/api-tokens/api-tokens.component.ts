import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MaterialModule } from '../../shared/material.module';
import { ApiToken, ApiTokenService, tokenStatus } from '../../services/api-token.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog.component';
import { CreateApiTokenDialogComponent } from './create-api-token-dialog.component';

/**
 * The signed-in user's API tokens for the MCP server. Renders nothing when
 * the server has MCP turned off.
 */
@Component({
  selector: 'app-api-tokens',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './api-tokens.component.html',
  styleUrls: ['./api-tokens.component.scss'],
})
export class ApiTokensComponent implements OnInit {
  private readonly apiTokens = inject(ApiTokenService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly tokens = signal<ApiToken[]>([]);
  readonly available = signal(false);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly hasActive = computed(() => this.tokens().some((t) => tokenStatus(t) === 'active'));
  readonly endpoint = this.apiTokens.mcpEndpointUrl();
  readonly columns = ['name', 'prefix', 'access', 'lastUsed', 'expires', 'status', 'actions'];
  readonly status = tokenStatus;

  ngOnInit(): void {
    this.load();
  }

  create(): void {
    this.dialog
      .open(CreateApiTokenDialogComponent, { width: '640px', disableClose: true })
      .afterClosed()
      .subscribe((created) => {
        if (created) {
          this.load();
        }
      });
  }

  revoke(token: ApiToken): void {
    this.confirm({
      title: 'Revoke API token',
      message: `"${token.name}" stops working immediately. Any assistant using it loses access.`,
      confirmText: 'Revoke',
      confirmColor: 'warn',
    }).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.apiTokens.revoke(token.id).subscribe({
        next: () => {
          this.notify('Token revoked');
          this.load();
        },
        error: () => this.notify('Could not revoke the token', 5000),
      });
    });
  }

  revokeAll(): void {
    this.confirm({
      title: 'Revoke all API tokens',
      message: 'All your active tokens stop working immediately.',
      confirmText: 'Revoke all',
      confirmColor: 'warn',
    }).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.apiTokens.revokeAll().subscribe({
        next: ({ revoked }) => {
          this.notify(`${revoked} token${revoked === 1 ? '' : 's'} revoked`);
          this.load();
        },
        error: () => this.notify('Could not revoke the tokens', 5000),
      });
    });
  }

  private load(): void {
    this.loading.set(true);
    this.apiTokens.listOwn().subscribe({
      next: (tokens) => {
        this.available.set(tokens !== null);
        this.tokens.set(tokens ?? []);
        this.loadError.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.available.set(true);
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  private confirm(data: ConfirmDialogData) {
    return this.dialog.open(ConfirmDialogComponent, { data, width: '480px' }).afterClosed();
  }

  private notify(message: string, duration = 3000): void {
    this.snackBar.open(message, 'Close', { duration });
  }
}
