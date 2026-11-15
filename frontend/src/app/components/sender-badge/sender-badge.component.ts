import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../shared/material.module';
import { DmarcReport } from '../../services/api.service';

type BadgeReport = Pick<Partial<DmarcReport>, 'authStatus' | 'authDomain' | 'claimedDomain'>;

/** Sender-authentication verdict of a report; nothing for legacy/manual. */
@Component({
  selector: 'app-sender-badge',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './sender-badge.component.html',
  styleUrls: ['./sender-badge.component.scss'],
})
export class SenderBadgeComponent {
  @Input({ required: true }) report!: BadgeReport;
  @Output() details = new EventEmitter<void>();

  get tooltip(): string {
    const { authStatus, authDomain, claimedDomain } = this.report;
    switch (authStatus) {
      case 'aligned':
        return `Verified sender: ${authDomain ?? 'unknown'}`;
      case 'unaligned':
        return `Authenticated as ${authDomain ?? 'unknown'}, but the report claims ${claimedDomain ?? 'another domain'}`;
      case 'unverified':
        return 'No DKIM signature or trusted ARC record proves who sent this report';
      default:
        return '';
    }
  }

  onClick(event: Event): void {
    event.stopPropagation();
    this.details.emit();
  }
}
