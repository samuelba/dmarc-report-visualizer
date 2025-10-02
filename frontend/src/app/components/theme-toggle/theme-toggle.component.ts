import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <button
      mat-icon-button
      (click)="toggleTheme()"
      [matTooltip]="themeService.isDarkMode() ? 'Switch to light mode' : 'Switch to dark mode'"
      class="theme-toggle"
    >
      <mat-icon>{{ themeService.isDarkMode() ? 'light_mode' : 'dark_mode' }}</mat-icon>
    </button>
  `,
  styles: [
    `
      .theme-toggle {
        transition: transform 0.2s ease-in-out;
      }

      .theme-toggle:hover {
        transform: scale(1.1);
      }

      .theme-toggle mat-icon {
        transition: color 0.2s ease-in-out;
      }
    `,
  ],
})
export class ThemeToggleComponent {
  readonly themeService = inject(ThemeService);

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
