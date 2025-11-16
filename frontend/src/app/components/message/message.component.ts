import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export type MessageType = 'info' | 'warning' | 'error' | 'success';

@Component({
  selector: 'app-message',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './message.component.html',
  styleUrls: ['./message.component.scss'],
})
export class MessageComponent {
  @Input() type: MessageType = 'info';
  @Input() icon?: string;
  @Input() showBorder: boolean = true;

  get defaultIcon(): string {
    if (this.icon) {
      return this.icon;
    }

    const iconMap: Record<MessageType, string> = {
      info: 'info',
      warning: 'warning',
      error: 'error',
      success: 'check_circle',
    };

    return iconMap[this.type];
  }

  get showIcon(): boolean {
    return this.icon !== undefined;
  }
}
