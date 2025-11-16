import { Routes } from '@angular/router';
import { authGuard, setupGuard } from './guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'setup',
    canActivate: [setupGuard],
    loadComponent: () => import('./pages/setup/setup.component').then((m) => m.SetupComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'totp-verification',
    loadComponent: () =>
      import('./pages/totp-verification/totp-verification.component').then((m) => m.TotpVerificationComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./pages/auth-callback/auth-callback.component').then((m) => m.AuthCallbackComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'reports',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/reports/reports.component').then((m) => m.ReportsComponent),
  },
  {
    path: 'domains',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/domains/domains.component').then((m) => m.DomainsComponent),
  },
  {
    path: 'upload',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/upload/upload.component').then((m) => m.UploadComponent),
  },
  {
    path: 'explore',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/explore/explore.component').then((m) => m.ExploreComponent),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
