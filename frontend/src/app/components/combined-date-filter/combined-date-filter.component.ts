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
  templateUrl: './combined-date-filter.component.html',
  styleUrls: ['./combined-date-filter.component.scss'],
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
