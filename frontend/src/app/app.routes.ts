import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'reports',
    loadComponent: () => import('./pages/reports/reports.component').then((m) => m.ReportsComponent),
  },
  {
    path: 'upload',
    loadComponent: () => import('./pages/upload/upload.component').then((m) => m.UploadComponent),
  },
  {
    path: 'explore',
    loadComponent: () => import('./pages/explore/explore.component').then((m) => m.ExploreComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
