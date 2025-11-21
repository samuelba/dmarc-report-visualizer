import { Component, signal, inject, ViewChild, OnInit } from '@angular/core';
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
import { AuthService } from './services/auth.service';
import { filter, take } from 'rxjs/operators';
import { AsyncPipe, NgIf } from '@angular/common';

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
    AsyncPipe,
    NgIf,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = signal('DMARC Report Visualizer');

  // Initialize services
  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);

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
    '/users': 'User Management',
    '/settings': 'Settings',
    '/profile': 'Profile',
    '/login': 'Login',
    '/setup': 'Setup',
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

  ngOnInit(): void {
    // Handle initial app load authentication check
    this.initializeAuth();
  }

  /**
   * Initialize authentication state on app load.
   * Checks if setup is needed or if user needs to login.
   */
  private initializeAuth(): void {
    const currentUrl = this.router.url;

    // Don't redirect if already on login or setup pages
    if (currentUrl.startsWith('/login') || currentUrl.startsWith('/setup')) {
      return;
    }

    // Check if setup is needed
    this.authService
      .checkSetup()
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          if (response.needsSetup) {
            // Setup is needed, redirect to setup page
            this.router.navigate(['/setup']);
          }
          // If setup is complete, let the auth guards handle authentication checks
          // This prevents overwriting return URLs that guards may have stored
        },
        error: (error) => {
          console.error('Error checking setup status:', error);
          // On error, redirect to login as a safe fallback
          // Only redirect if not already navigating
          if (!this.router.url.startsWith('/login')) {
            this.router.navigate(['/login']);
          }
        },
      });
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

  protected logout() {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
      },
      error: (error) => {
        console.error('Logout error:', error);
        // Navigate to login even if logout fails
        this.router.navigate(['/login']);
      },
    });
  }
}
