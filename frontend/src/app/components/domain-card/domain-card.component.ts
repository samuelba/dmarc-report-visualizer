import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../shared/material.module';
import { DomainStatistics } from '../../services/api.service';

@Component({
  selector: 'app-domain-card',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './domain-card.component.html',
  styleUrls: ['./domain-card.component.scss'],
})
export class DomainCardComponent {
  @Input() domain!: DomainStatistics;
  @Input() isManaged = false;

  @Output() edit = new EventEmitter<DomainStatistics>();
  @Output() remove = new EventEmitter<DomainStatistics>();
  @Output() addToManaged = new EventEmitter<string>();

  onEdit(): void {
    this.edit.emit(this.domain);
  }

  onRemove(): void {
    this.remove.emit(this.domain);
  }

  onAddToManaged(): void {
    this.addToManaged.emit(this.domain.domain);
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
