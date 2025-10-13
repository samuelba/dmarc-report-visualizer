import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { ApiService, ThirdPartySender, ReprocessingJob } from '../../services/api.service';
import { ThirdPartySenderDialogComponent } from './third-party-sender-dialog.component';
import { timer, takeWhile } from 'rxjs';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressBarModule,
    MatChipsModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatInputModule,
    MatNativeDateModule,
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  // Third-Party Senders
  thirdPartySenders = signal<ThirdPartySender[]>([]);
  displayedColumns = ['enabled', 'name', 'dkimPattern', 'spfPattern', 'actions'];
  loadingSenders = signal(false);

  // Reprocessing
  currentJob = signal<ReprocessingJob | null>(null);
  reprocessingHistory = signal<ReprocessingJob[]>([]);
  isReprocessing = signal(false);
  jobDisplayedColumns = ['status', 'created', 'range', 'records', 'results', 'duration'];

  // Tab tracking
  selectedTabIndex = signal(0);
  private readonly REPROCESSING_TAB_INDEX = 1;

  // Date range for reprocessing
  dateFrom = signal<Date | null>(null);
  dateTo = signal<Date | null>(null);

  ngOnInit() {
    this.loadThirdPartySenders();
    this.loadCurrentJob();
    this.loadReprocessingHistory();
  }

  // Tab change handler
  onTabChange(index: number) {
    this.selectedTabIndex.set(index);

    // If switching to reprocessing tab and there's a running job, start polling
    if (index === this.REPROCESSING_TAB_INDEX && this.isReprocessing()) {
      const job = this.currentJob();
      if (job && (job.status === 'running' || job.status === 'pending')) {
        this.pollJobStatus(job.id);
      }
    }
  }

  // Third-Party Senders Methods
  loadThirdPartySenders() {
    this.loadingSenders.set(true);
    this.api.getThirdPartySenders().subscribe({
      next: (senders) => {
        this.thirdPartySenders.set(senders);
        this.loadingSenders.set(false);
      },
      error: (err) => {
        console.error('Failed to load third-party senders:', err);
        this.snackBar.open('Failed to load third-party senders', 'Close', { duration: 5000 });
        this.loadingSenders.set(false);
      },
    });
  }

  openCreateDialog() {
    const dialogRef = this.dialog.open(ThirdPartySenderDialogComponent, {
      width: '600px',
      data: { mode: 'create' },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadThirdPartySenders();
        this.snackBar.open('Third-party sender created successfully', 'Close', { duration: 3000 });
      }
    });
  }

  openEditDialog(sender: ThirdPartySender) {
    const dialogRef = this.dialog.open(ThirdPartySenderDialogComponent, {
      width: '600px',
      data: { mode: 'edit', sender },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.loadThirdPartySenders();
        this.snackBar.open('Third-party sender updated successfully', 'Close', { duration: 3000 });
      }
    });
  }

  toggleEnabled(sender: ThirdPartySender, event: any) {
    const enabled = event.checked;
    this.api.updateThirdPartySender(sender.id, { enabled }).subscribe({
      next: () => {
        sender.enabled = enabled;
        this.snackBar.open(`Third-party sender ${enabled ? 'enabled' : 'disabled'}`, 'Close', { duration: 3000 });
      },
      error: (err) => {
        console.error('Failed to toggle sender:', err);
        this.snackBar.open('Failed to update sender', 'Close', { duration: 5000 });
        // Revert toggle
        event.source.checked = !enabled;
      },
    });
  }

  deleteSender(sender: ThirdPartySender) {
    if (!confirm(`Are you sure you want to delete "${sender.name}"?`)) {
      return;
    }

    this.api.deleteThirdPartySender(sender.id).subscribe({
      next: () => {
        this.loadThirdPartySenders();
        this.snackBar.open('Third-party sender deleted successfully', 'Close', { duration: 3000 });
      },
      error: (err) => {
        console.error('Failed to delete sender:', err);
        this.snackBar.open('Failed to delete sender', 'Close', { duration: 5000 });
      },
    });
  }

  // Reprocessing Methods
  loadCurrentJob() {
    this.api.getCurrentReprocessingJob().subscribe({
      next: (job) => {
        this.currentJob.set(job);

        // If job is running, poll for updates
        if (job && (job.status === 'running' || job.status === 'pending')) {
          this.isReprocessing.set(true);
          this.pollJobStatus(job.id);
        } else {
          this.isReprocessing.set(false);
        }
      },
      error: (err) => {
        console.error('Failed to load current job:', err);
      },
    });
  }

  loadReprocessingHistory() {
    this.api.getReprocessingJobs().subscribe({
      next: (jobs) => {
        this.reprocessingHistory.set(jobs);
      },
      error: (err) => {
        console.error('Failed to load reprocessing history:', err);
      },
    });
  }

  startReprocessing() {
    if (this.isReprocessing()) {
      this.snackBar.open('A reprocessing job is already running', 'Close', { duration: 3000 });
      return;
    }

    const from = this.dateFrom();
    const to = this.dateTo();

    let rangeText = 'all DMARC records';
    if (from && to) {
      rangeText = `records from ${from.toLocaleDateString()} to ${to.toLocaleDateString()}`;
    } else if (from) {
      rangeText = `records from ${from.toLocaleDateString()} onwards`;
    } else if (to) {
      rangeText = `records up to ${to.toLocaleDateString()}`;
    }

    if (!confirm(`This will reprocess ${rangeText} and may take several minutes/hours. Continue?`)) {
      return;
    }

    const fromStr = from ? from.toISOString() : undefined;
    const toStr = to ? to.toISOString() : undefined;

    this.api.startReprocessing(fromStr, toStr).subscribe({
      next: (job) => {
        this.currentJob.set(job);
        this.isReprocessing.set(true);
        this.snackBar.open('Reprocessing started', 'Close', { duration: 3000 });
        this.pollJobStatus(job.id);
      },
      error: (err) => {
        console.error('Failed to start reprocessing:', err);
        this.snackBar.open('Failed to start reprocessing', 'Close', { duration: 5000 });
      },
    });
  }

  cancelReprocessing() {
    const job = this.currentJob();
    if (!job) {
      return;
    }

    if (!confirm('Are you sure you want to cancel the reprocessing job?')) {
      return;
    }

    this.api.cancelReprocessing(job.id).subscribe({
      next: () => {
        this.snackBar.open('Reprocessing cancellation requested', 'Close', { duration: 3000 });
        // Continue polling to see the cancellation complete
      },
      error: (err) => {
        console.error('Failed to cancel reprocessing:', err);
        this.snackBar.open('Failed to cancel reprocessing', 'Close', { duration: 5000 });
      },
    });
  }

  private pollJobStatus(jobId: string) {
    // Poll immediately, then every 10 seconds (only when reprocessing tab is active)
    timer(0, 10000)
      .pipe(
        takeWhile(() => {
          // Stop polling if:
          // 1. Job is no longer running
          // 2. User switched away from reprocessing tab
          return this.isReprocessing() && this.selectedTabIndex() === this.REPROCESSING_TAB_INDEX;
        })
      )
      .subscribe(() => {
        this.api.getReprocessingJob(jobId).subscribe({
          next: (job) => {
            this.currentJob.set(job);

            // Stop polling if job is finished
            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
              this.isReprocessing.set(false);
              this.loadReprocessingHistory();

              if (job.status === 'completed') {
                this.snackBar.open('Reprocessing completed successfully!', 'Close', { duration: 5000 });
              } else if (job.status === 'cancelled') {
                this.snackBar.open('Reprocessing was cancelled', 'Close', { duration: 5000 });
              } else {
                this.snackBar.open('Reprocessing failed', 'Close', { duration: 5000 });
              }
            }
          },
          error: (err) => {
            console.error('Failed to poll job status:', err);
            this.isReprocessing.set(false);
          },
        });
      });
  }

  getProgress(job: ReprocessingJob): number {
    if (!job.totalRecords || job.totalRecords === 0) {
      return 0;
    }
    return Math.round((job.processedRecords / job.totalRecords) * 100);
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'pending':
        return 'schedule';
      case 'running':
        return 'autorenew';
      case 'completed':
        return 'check_circle';
      case 'failed':
        return 'error';
      case 'cancelled':
        return 'cancel';
      default:
        return 'help';
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'pending':
        return 'accent';
      case 'running':
        return 'primary';
      case 'completed':
        return 'green';
      case 'failed':
        return 'warn';
      case 'cancelled':
        return 'warn';
      default:
        return '';
    }
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) {
      return '-';
    }
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  formatDuration(startedAt: string | undefined, completedAt: string | undefined): string {
    if (!startedAt) {
      return '-';
    }

    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const seconds = Math.round((end - start) / 1000);

    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
