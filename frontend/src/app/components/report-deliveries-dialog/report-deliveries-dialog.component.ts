import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MaterialModule } from '../../shared/material.module';
import { ApiService, ReportAuthStatus, ReportDelivery } from '../../services/api.service';

export interface ReportDeliveriesDialogData {
  reportId: string;
  title: string;
  authStatus?: ReportAuthStatus;
}

const NO_DELIVERIES_REASONS: Partial<Record<ReportAuthStatus, string>> = {
  legacy: 'This report was stored before sender verification existed, so it has no delivery history.',
  manual: 'This report was uploaded manually, so it has no email delivery history.',
  unchecked: 'This report arrived while sender verification was turned off.',
};

const SOURCE_LABELS: Record<ReportDelivery['source'], string> = {
  imap: 'IMAP',
  gmail: 'Gmail',
  upload: 'Upload',
  directory: 'Directory import',
  file: 'File watcher',
};

/** Every received copy of a report, with the sender evidence of each. */
@Component({
  selector: 'app-report-deliveries-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MaterialModule],
  templateUrl: './report-deliveries-dialog.component.html',
  styleUrls: ['./report-deliveries-dialog.component.scss'],
})
export class ReportDeliveriesDialogComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly deliveries = signal<ReportDelivery[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);

  constructor(@Inject(MAT_DIALOG_DATA) public data: ReportDeliveriesDialogData) {}

  ngOnInit(): void {
    this.api.getReportDeliveries(this.data.reportId).subscribe({
      next: (rows) => {
        this.deliveries.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  get noDeliveriesReason(): string {
    const status = this.data.authStatus;
    return (status && NO_DELIVERIES_REASONS[status]) ?? 'No deliveries recorded for this report.';
  }

  sourceLabel(delivery: ReportDelivery): string {
    return SOURCE_LABELS[delivery.source] ?? delivery.source;
  }

  details(delivery: ReportDelivery): string {
    return JSON.stringify(delivery.authDetails, null, 2);
  }
}
