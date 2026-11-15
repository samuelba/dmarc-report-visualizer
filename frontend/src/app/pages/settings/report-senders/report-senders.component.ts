import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MaterialModule } from '../../../shared/material.module';
import { ApiService, TrustedReporter, UnalignedSender } from '../../../services/api.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../components/confirm-dialog/confirm-dialog.component';

/** Mailbox providers whose ordinary users could then speak for the claimed domain. */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'gmx.com',
  'gmx.net',
  'web.de',
  'mail.com',
  'proton.me',
  'protonmail.com',
  'yandex.com',
  'zoho.com',
]);

/**
 * Reports authenticated by a different domain than the one they claim, and
 * the pairs an admin has accepted as genuine.
 */
@Component({
  selector: 'app-report-senders',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './report-senders.component.html',
  styleUrls: ['./report-senders.component.scss'],
})
export class ReportSendersComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly unaligned = signal<UnalignedSender[]>([]);
  readonly trusted = signal<TrustedReporter[]>([]);
  readonly loading = signal(true);

  readonly unalignedColumns = ['claimedDomain', 'authDomain', 'orgNames', 'reportCount', 'lastSeen', 'actions'];
  readonly trustedColumns = ['claimedDomain', 'authDomain', 'createdBy', 'createdAt', 'actions'];

  ngOnInit(): void {
    this.load();
  }

  trust(sender: UnalignedSender): void {
    const freeMail = FREE_MAIL_DOMAINS.has(sender.authDomain)
      ? ` Warning: ${sender.authDomain} is a free-mail domain, so any of its users could then send reports in the name of ${sender.claimedDomain}.`
      : '';
    this.confirm({
      title: 'Trust report sender',
      message:
        `Reports claiming ${sender.claimedDomain} that are authenticated as ${sender.authDomain} ` +
        `will be treated as genuine, including the ${sender.reportCount} already received.${freeMail}`,
      confirmText: 'Trust',
      confirmColor: freeMail ? 'warn' : 'primary',
    }).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.api.trustReporter({ claimedDomain: sender.claimedDomain, authDomain: sender.authDomain }).subscribe({
        next: ({ upgradedReports }) => {
          this.notify(`Trusted ${sender.authDomain} for ${sender.claimedDomain}; ${upgradedReports} reports aligned`);
          this.load();
        },
        error: (err) => this.notify(`Could not trust sender: ${this.errorMessage(err)}`, 5000),
      });
    });
  }

  revoke(pair: TrustedReporter): void {
    this.confirm({
      title: 'Revoke trusted sender',
      message: `Reports from ${pair.authDomain} claiming ${pair.claimedDomain} will be unaligned again.`,
      confirmText: 'Revoke',
      confirmColor: 'warn',
    }).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.api.revokeTrustedReporter(pair.id).subscribe({
        next: ({ downgradedReports }) => {
          this.notify(`Revoked; ${downgradedReports} reports are unaligned again`);
          this.load();
        },
        error: (err) => this.notify(`Could not revoke: ${this.errorMessage(err)}`, 5000),
      });
    });
  }

  private load(): void {
    this.loading.set(true);
    this.api.listUnalignedSenders().subscribe({
      next: (rows) => {
        this.unaligned.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.notify('Failed to load unaligned senders', 5000);
        this.loading.set(false);
      },
    });
    this.api.listTrustedReporters().subscribe({
      next: (rows) => this.trusted.set(rows),
      error: () => this.notify('Failed to load trusted senders', 5000),
    });
  }

  private confirm(data: ConfirmDialogData) {
    return this.dialog.open(ConfirmDialogComponent, { data, width: '480px' }).afterClosed();
  }

  private notify(message: string, duration = 3000): void {
    this.snackBar.open(message, 'Close', { duration });
  }

  private errorMessage(err: unknown): string {
    const message = (err as { error?: { message?: unknown } })?.error?.message;
    return typeof message === 'string' ? message : 'unexpected error';
  }
}
