import { Component, EventEmitter, Input, Output, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatRadioModule } from '@angular/material/radio';

export interface DateFilterValue {
  mode: 'period' | 'range';
  periodInput?: string;
  fromDate?: Date;
  toDate?: Date;
}

@Component({
  selector: 'app-combined-date-filter',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatMenuModule,
    MatRadioModule,
  ],
  template: `
    <div class="combined-date-filter">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="display-field">
        <mat-label>Date Filter</mat-label>
        <input
          matInput
          [value]="getDisplayText()"
          readonly
          [matMenuTriggerFor]="filterMenu"
          #menuTrigger="matMenuTrigger"
          style="cursor: pointer;"
        />
      </mat-form-field>

      <mat-menu #filterMenu="matMenu" [class]="'combined-date-filter-menu'">
        <div class="menu-content" (click)="$event.stopPropagation()">
          <div class="mode-selector">
            <mat-radio-group [(ngModel)]="tempMode" (change)="onModeChange()">
              <mat-radio-button value="period">Time Period</mat-radio-button>
              <mat-radio-button value="range">Date Range</mat-radio-button>
            </mat-radio-group>
          </div>

          <div class="filter-content">
            <!-- Time Period Mode -->
            <div *ngIf="tempMode === 'period'" class="period-mode">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Time Period</mat-label>
                <input
                  matInput
                  [(ngModel)]="tempPeriodInput"
                  placeholder="e.g. 30, 7d, 4m, 5y, or 'all'"
                  (keydown.enter)="applyFilter()"
                />
                <mat-hint>Format: number (days) or Xd/Xm/Xy or 'all'</mat-hint>
              </mat-form-field>

              <div class="quick-options">
                <button matButton="outlined" (click)="selectQuickPeriod('7d')">Last 7 days</button>
                <button matButton="outlined" (click)="selectQuickPeriod('30d')">Last 30 days</button>
                <button matButton="outlined" (click)="selectQuickPeriod('3m')">Last 3 months</button>
                <button matButton="outlined" (click)="selectQuickPeriod('6m')">Last 6 months</button>
                <button matButton="outlined" (click)="selectQuickPeriod('1y')">Last year</button>
                <button matButton="outlined" (click)="selectQuickPeriod('all')">All time</button>
              </div>
            </div>

            <!-- Date Range Mode -->
            <div *ngIf="tempMode === 'range'" class="range-mode">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Enter a date range</mat-label>
                <mat-date-range-input [rangePicker]="rangePicker">
                  <input matStartDate [(ngModel)]="tempFromDate" placeholder="Start date" />
                  <input matEndDate [(ngModel)]="tempToDate" placeholder="End date" />
                </mat-date-range-input>
                <mat-datepicker-toggle matIconSuffix [for]="rangePicker"></mat-datepicker-toggle>
                <mat-date-range-picker #rangePicker></mat-date-range-picker>
              </mat-form-field>
            </div>
          </div>

          <div class="menu-actions">
            <button matButton="text" (click)="clearFilter()">Clear</button>
            <button matButton="filled" color="primary" (click)="applyFilter()">Apply</button>
          </div>
        </div>
      </mat-menu>
    </div>
  `,
  styles: [
    `
      .combined-date-filter {
        width: 100%;
      }
    `,
    `
      .display-field {
        width: 100%;
      }
    `,
    `
      .menu-content {
        padding: 16px;
        min-width: 300px;
        max-width: 350px;
        width: max-content;
        box-sizing: border-box;
      }
    `,
    `
      .mode-selector {
        margin-bottom: 16px;
        padding-bottom: 16px;
        border-bottom: 1px solid #e0e0e0;
      }
    `,
    `
      .mode-selector mat-radio-button {
        margin-right: 16px;
      }
    `,
    `
      .filter-content {
        margin-bottom: 16px;
      }
    `,
    `
      .period-mode mat-form-field {
        width: 100%;
        box-sizing: border-box;
      }
    `,
    `
      .period-mode mat-hint {
        font-size: 12px;
      }
    `,
    `
      .quick-options {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }
    `,
    `
      .quick-options button {
        font-size: 12px;
      }
    `,
    `
      .range-mode mat-form-field {
        width: 100%;
        box-sizing: border-box;
      }
    `,
    `
      .menu-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding-top: 16px;
        border-top: 1px solid #e0e0e0;
      }
    `,
  ],
})
export class CombinedDateFilterComponent {
  @Input() value: DateFilterValue = { mode: 'period', periodInput: '30d' };
  @Output() valueChange = new EventEmitter<DateFilterValue>();
  @ViewChild('menuTrigger') menuTrigger!: MatMenuTrigger;

  // Temporary values for the menu
  tempMode: 'period' | 'range' = 'period';
  tempPeriodInput: string = '30d';
  tempFromDate?: Date;
  tempToDate?: Date;

  ngOnInit() {
    this.syncTempValues();
  }

  ngOnChanges() {
    this.syncTempValues();
  }

  private syncTempValues() {
    this.tempMode = this.value.mode;
    this.tempPeriodInput = this.value.periodInput || '30d';
    this.tempFromDate = this.value.fromDate;
    this.tempToDate = this.value.toDate;
  }

  onModeChange() {
    // Reset values when switching modes
    if (this.tempMode === 'period') {
      this.tempPeriodInput = '30d';
      this.tempFromDate = undefined;
      this.tempToDate = undefined;
    } else {
      this.tempFromDate = undefined;
      this.tempToDate = undefined;
    }
  }

  selectQuickPeriod(period: string) {
    this.tempPeriodInput = period;
    this.applyFilter();
  }

  getDisplayText(): string {
    if (this.value.mode === 'period') {
      const input = this.value.periodInput || '30d';
      if (input === 'all' || input === '') {
        return 'All time';
      }
      return `Last ${input}`;
    } else {
      if (this.value.fromDate && this.value.toDate) {
        const from = this.formatDate(this.value.fromDate);
        const to = this.formatDate(this.value.toDate);
        return `${from} - ${to}`;
      }
      return 'Select date range';
    }
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  }

  applyFilter() {
    const newValue: DateFilterValue = {
      mode: this.tempMode,
    };

    if (this.tempMode === 'period') {
      newValue.periodInput = this.tempPeriodInput;
    } else {
      newValue.fromDate = this.tempFromDate;
      newValue.toDate = this.tempToDate;
    }

    this.value = newValue;
    this.valueChange.emit(newValue);
    
    // Close the menu after applying
    this.menuTrigger.closeMenu();
  }

  clearFilter() {
    this.tempMode = 'period';
    this.tempPeriodInput = '30d';
    this.tempFromDate = undefined;
    this.tempToDate = undefined;
    this.applyFilter();
  }
}
