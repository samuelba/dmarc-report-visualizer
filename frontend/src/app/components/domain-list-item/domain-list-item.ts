import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MaterialModule } from '../../shared/material.module';
import { DomainStatistics } from '../../services/api.service';

@Component({
  selector: 'app-domain-list-item',
  imports: [CommonModule, MaterialModule],
  templateUrl: './domain-list-item.html',
  styleUrl: './domain-list-item.scss',
})
export class DomainListItemComponent {
  @Input() domain!: DomainStatistics;
  @Input() isManaged = false;
  @Input() daysBack = 30;

  @Output() edit = new EventEmitter<DomainStatistics>();
  @Output() remove = new EventEmitter<DomainStatistics>();
  @Output() addToManaged = new EventEmitter<string>();

  constructor(private router: Router) {}

  onEdit(): void {
    this.edit.emit(this.domain);
  }

  onRemove(): void {
    this.remove.emit(this.domain);
  }

  onAddToManaged(): void {
    this.addToManaged.emit(this.domain.domain);
  }

  onExplore(): void {
    this.router.navigate(['/explore'], {
      queryParams: {
        headerFrom: this.domain.domain,
        period: `${this.daysBack}d`,
      },
    });
  }

  getPassRateClass(rate: number): string {
    if (rate >= 85) {
      return 'pass-rate-good';
    }
    if (rate >= 60) {
      return 'pass-rate-warning';
    }
    return 'pass-rate-danger';
  }
}
