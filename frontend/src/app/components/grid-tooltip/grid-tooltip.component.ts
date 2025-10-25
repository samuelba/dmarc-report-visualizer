import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export interface GridTooltipRow {
  label: string;
  value: string;
  statusClass?: string; // Optional CSS class for status-based styling
  icon?: string; // Optional Material icon name to display before the value
}

export interface GridTooltipSection {
  title: string;
  rows: GridTooltipRow[];
}

@Component({
  standalone: true,
  selector: 'app-grid-tooltip',
  imports: [CommonModule, MatIconModule],
  templateUrl: './grid-tooltip.component.html',
  styleUrl: './grid-tooltip.component.scss',
})
export class GridTooltipComponent {
  @Input() title?: string;
  @Input() rows: GridTooltipRow[] = [];
  @Input() sections: GridTooltipSection[] = [];
  @Input() emptyMessage?: string;
}
