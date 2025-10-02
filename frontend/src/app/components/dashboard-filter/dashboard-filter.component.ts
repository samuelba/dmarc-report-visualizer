import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { ApiService } from '../../services/api.service';
import { Observable, startWith, map } from 'rxjs';

@Component({
  selector: 'app-dashboard-filter',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MaterialModule],
  template: `
    <div class="compact-filter">
      <div class="filter-row">
        <mat-form-field appearance="outline" class="domain-field">
          <mat-label>Domain</mat-label>
          <mat-select [formControl]="domainControl" multiple>
            <mat-option value="">All Domains</mat-option>
            <mat-option *ngFor="let domain of domains" [value]="domain">
              {{ domain }}
            </mat-option>
          </mat-select>
          <mat-icon matSuffix>domain</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline" class="time-period-field">
          <mat-label>Time Period</mat-label>
          <input
            matInput
            [(ngModel)]="timePeriodInput"
            (input)="onTimePeriodInputChange()"
            placeholder="e.g. 30, 7d, 4m, 5y, or 'all'"
          />
        </mat-form-field>

        <mat-form-field appearance="outline" class="date-field">
          <mat-label>From</mat-label>
          <input matInput [matDatepicker]="fromPicker" [formControl]="fromDateControl" />
          <mat-datepicker-toggle matSuffix [for]="fromPicker"></mat-datepicker-toggle>
          <mat-datepicker #fromPicker></mat-datepicker>
        </mat-form-field>

        <mat-form-field appearance="outline" class="date-field">
          <mat-label>To</mat-label>
          <input matInput [matDatepicker]="toPicker" [formControl]="toDateControl" />
          <mat-datepicker-toggle matSuffix [for]="toPicker"></mat-datepicker-toggle>
          <mat-datepicker #toPicker></mat-datepicker>
        </mat-form-field>

        <div class="filter-buttons">
          <button mat-stroked-button (click)="clearFilter()" matTooltip="Clear Filter">
            <mat-icon>clear</mat-icon>
          </button>
          <button mat-stroked-button color="primary" (click)="refreshData()" matTooltip="Refresh Data">
            <mat-icon>refresh</mat-icon>
            Refresh
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .compact-filter {
        margin-bottom: 16px;
      }

      .filter-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .domain-field {
        min-width: 200px;
        flex: 1;
      }

      .time-period-field {
        min-width: 180px;
      }

      .date-field {
        min-width: 140px;
      }

      .filter-buttons {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .filter-buttons button {
        min-width: 40px;
        padding: 0 8px;
      }

      /* Responsive behavior */
      @media (max-width: 768px) {
        .filter-row {
          flex-direction: column;
          align-items: stretch;
        }

        .domain-field,
        .time-period-field,
        .date-field {
          min-width: unset;
          width: 100%;
        }

        .filter-buttons {
          justify-content: center;
        }
      }
    `,
  ],
})
export class DashboardFilterComponent implements OnInit {
  @Output() filterChange = new EventEmitter<{
    domains: string[];
    fromDate?: Date;
    toDate?: Date;
  }>();

  @Output() refreshRequested = new EventEmitter<void>();

  domainControl = new FormControl<string[]>([]);
  fromDateControl = new FormControl<Date | null>(null);
  toDateControl = new FormControl<Date | null>(null);
  timePeriodInput: string = '30d';

  domains: string[] = [];

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadDomains();

    // Apply default 30d time period on init (before subscribing to avoid race condition)
    this.applyTimePeriodToFilter();

    // Auto-apply filter when values change
    this.domainControl.valueChanges.subscribe(() => this.applyFilter());
    this.fromDateControl.valueChanges.subscribe(() => this.applyFilter());
    this.toDateControl.valueChanges.subscribe(() => this.applyFilter());

    // Apply initial filter after subscriptions are set up
    this.applyFilter();
  }

  private loadDomains() {
    this.apiService.getDomains().subscribe({
      next: (response) => {
        this.domains = response.domains;
      },
      error: (error) => {
        console.error('Failed to load domains:', error);
      },
    });
  }

  onTimePeriodInputChange() {
    this.applyTimePeriodToFilter();
    this.applyFilter();
  }

  private applyTimePeriodToFilter() {
    const input = this.timePeriodInput.trim().toLowerCase();

    if (input === 'all' || input === '') {
      this.fromDateControl.setValue(null, { emitEvent: false });
      this.toDateControl.setValue(null, { emitEvent: false });
      return;
    }

    const days = this.parseTimePeriodToDays(input);
    if (days > 0) {
      const now = new Date();

      // Set toDate to end of yesterday (since today's reports likely aren't available yet)
      const toDate = new Date(now);
      toDate.setDate(now.getDate() - 1); // Go to yesterday
      toDate.setHours(23, 59, 59, 999); // End of yesterday

      // Set fromDate to start of the day N days before yesterday
      // For "last 2 days" we want: yesterday + day before yesterday = 2 days of actual data
      const fromDate = new Date(now);
      fromDate.setDate(now.getDate() - days); // Go back N days from today (which gives us N days ending yesterday)
      fromDate.setHours(0, 0, 0, 0); // Start of that day

      this.fromDateControl.setValue(fromDate, { emitEvent: false });
      this.toDateControl.setValue(toDate, { emitEvent: false });
    } else {
      // Invalid input, reset to no time restriction
      this.fromDateControl.setValue(null, { emitEvent: false });
      this.toDateControl.setValue(null, { emitEvent: false });
    }
  }

  private parseTimePeriodToDays(input: string): number {
    // Handle plain numbers (assume days)
    if (/^\d+$/.test(input)) {
      return parseInt(input, 10);
    }

    // Handle format with suffix (d, m, y)
    const match = input.match(/^(\d+)([dmy])$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];

      switch (unit) {
        case 'd':
          return value; // days
        case 'm':
          return value * 30; // months (approximate)
        case 'y':
          return value * 365; // years (approximate)
        default:
          return 0;
      }
    }

    return 0; // Invalid format
  }

  applyFilter() {
    const domains = this.domainControl.value || [];
    const fromDate = this.fromDateControl.value;
    const toDate = this.toDateControl.value;

    this.filterChange.emit({
      domains: domains.filter((d) => d !== ''), // Remove empty string
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    });
  }

  clearFilter() {
    this.domainControl.setValue([]);
    this.fromDateControl.setValue(null);
    this.toDateControl.setValue(null);
    this.timePeriodInput = '30d';
    this.applyFilter();
  }

  refreshData() {
    this.refreshRequested.emit();
  }
}
