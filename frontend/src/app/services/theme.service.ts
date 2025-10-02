import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly THEME_KEY = 'dmarc-theme';

  // Signal to track current theme
  readonly isDarkMode = signal<boolean>(this.getInitialTheme());

  constructor() {
    // Effect to apply theme changes to document
    effect(() => {
      this.applyTheme(this.isDarkMode());
    });
  }

  /**
   * Toggle between light and dark themes
   */
  toggleTheme(): void {
    this.isDarkMode.set(!this.isDarkMode());
    this.saveThemePreference(this.isDarkMode());
  }

  /**
   * Set theme explicitly
   */
  setTheme(isDark: boolean): void {
    this.isDarkMode.set(isDark);
    this.saveThemePreference(isDark);
  }

  /**
   * Get initial theme from localStorage or system preference
   */
  private getInitialTheme(): boolean {
    // Check localStorage first
    const savedTheme = localStorage.getItem(this.THEME_KEY);
    if (savedTheme !== null) {
      return savedTheme === 'dark';
    }

    // Fall back to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /**
   * Apply theme to document
   */
  private applyTheme(isDark: boolean): void {
    const body = document.body;

    if (isDark) {
      body.classList.add('dark-theme');
      body.classList.remove('light-theme');
    } else {
      body.classList.add('light-theme');
      body.classList.remove('dark-theme');
    }
  }

  /**
   * Save theme preference to localStorage
   */
  private saveThemePreference(isDark: boolean): void {
    localStorage.setItem(this.THEME_KEY, isDark ? 'dark' : 'light');
  }
}
