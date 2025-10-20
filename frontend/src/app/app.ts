import { Component, signal, inject, ViewChild } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatSidenavModule, MatSidenavContainer } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';
import { ThemeService } from './services/theme.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
    MatDividerModule,
    MatTooltipModule,
    RouterModule,
    ThemeToggleComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('DMARC Report Visualizer');

  // Initialize theme service
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);

  // Collapsed state for the left nav
  protected readonly isCollapsed = signal<boolean>(true);

  @ViewChild(MatSidenavContainer) private sidenavContainer?: MatSidenavContainer;

  // Map of routes to titles
  private readonly routeTitles: Record<string, string> = {
    '/dashboard': 'DMARC Report Visualizer',
    '/explore': 'Explore',
    '/domains': 'Domain Review',
    '/reports': 'Reports',
    '/upload': 'Upload',
    '/settings': 'Settings',
  };

  constructor() {
    const iconRegistry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);

    // Register the GitHub icon
    iconRegistry.addSvgIcon('github', sanitizer.bypassSecurityTrustResourceUrl('assets/github.svg'));

    // Listen to route changes and update title
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.updateTitle(event.urlAfterRedirects);
      });

    // Set initial title based on current route
    this.updateTitle(this.router.url);
  }

  private updateTitle(url: string): void {
    // Remove query params and fragments
    const path = url.split('?')[0].split('#')[0];
    const title = this.routeTitles[path] || 'DMARC Report Visualizer';
    this.title.set(title);
  }

  protected toggleSidenav() {
    this.isCollapsed.update((v) => !v);
    // Ensure the content margins are recalculated when the drawer width changes
    // Use a microtask to wait for DOM to reflect the new width
    queueMicrotask(() => this.sidenavContainer?.updateContentMargins());
  }
}
