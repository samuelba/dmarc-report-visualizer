import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';
import { ApiService } from '../../services/api.service';
import { Observable, startWith, map } from 'rxjs';
import { CombinedDateFilterComponent, DateFilterValue } from '../combined-date-filter/combined-date-filter.component';

@Component({
  selector: 'app-dashboard-filter',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MaterialModule, CombinedDateFilterComponent],
  templateUrl: './dashboard-filter.component.html',
  styleUrls: ['./dashboard-filter.component.scss'],
})
export class DashboardFilterComponent implements OnInit {
  @Output() filterChange = new EventEmitter<{
    domains: string[];
    fromDate?: Date;
    toDate?: Date;
  }>();

  @Output() refreshRequested = new EventEmitter<void>();

  domainControl = new FormControl<string[]>([]);
  dateFilterValue: DateFilterValue = { mode: 'period', periodInput: '30d' };

  // Internal tracking for from/to dates
  private fromDate?: Date;
  private toDate?: Date;

  domains: string[] = [];

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    // Apply default 30d time period on init
    this.applyTimePeriodToFilter('30d');

    // Load domains for initial timeframe
    this.loadDomainsForTimeframe();

    // Auto-apply filter when domain values change
    this.domainControl.valueChanges.subscribe(() => this.applyFilter());

    // Apply initial filter after subscriptions are set up
    this.applyFilter();
  }

  onDateFilterChange(value: DateFilterValue) {
    this.dateFilterValue = value;

    if (value.mode === 'period') {
      this.applyTimePeriodToFilter(value.periodInput || '30d');
    } else {
      // Date range mode
      this.fromDate = value.fromDate;
      this.toDate = value.toDate;
    }

    this.loadDomainsForTimeframe();
    this.applyFilter();
  }

  private getFromToIso(): { from?: string; to?: string } {
    const from = this.fromDate?.toISOString();
    const to = this.toDate?.toISOString();
    return { from, to };
  }

  private loadDomainsForTimeframe() {
    const { from, to } = this.getFromToIso();
    const prev = this.domainControl.value || [];
    this.apiService.getRecordDistinct('headerFrom', { from, to }).subscribe({
      next: (values) => {
        this.domains = values || [];
        // Preserve selections that still exist
        const filteredSelection = prev.filter((v) => v && this.domains.includes(v));
        if (filteredSelection.length !== prev.length) {
          this.domainControl.setValue(filteredSelection, { emitEvent: false });
        }
      },
      error: (error) => console.error('Failed to load domains for timeframe:', error),
    });
  }

  private applyTimePeriodToFilter(periodInput: string = '30d') {
    const input = periodInput.trim().toLowerCase();

    if (input === 'all' || input === '') {
      this.fromDate = undefined;
      this.toDate = undefined;
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
      const fromDate = new Date(now);
      fromDate.setDate(now.getDate() - days); // Go back N days from today
      fromDate.setHours(0, 0, 0, 0); // Start of that day

      this.fromDate = fromDate;
      this.toDate = toDate;
    } else {
      // Invalid input, reset to no time restriction
      this.fromDate = undefined;
      this.toDate = undefined;
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

    this.filterChange.emit({
      domains: domains.filter((d) => d !== ''), // Remove empty string
      fromDate: this.fromDate,
      toDate: this.toDate,
    });
  }

  clearFilter() {
    this.domainControl.setValue([]);
    this.dateFilterValue = { mode: 'period', periodInput: '30d' };
    this.applyTimePeriodToFilter('30d');
    this.loadDomainsForTimeframe();
    this.applyFilter();
  }

  refreshData() {
    this.refreshRequested.emit();
  }
}
