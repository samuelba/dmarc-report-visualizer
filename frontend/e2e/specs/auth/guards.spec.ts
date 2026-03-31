import { test, expect } from '@playwright/test';
import { mockUnauthenticatedApp, mockAuthenticatedAdmin, mockDashboardData } from '../../helpers/mock-api';

test.describe('Auth Guards', () => {
  test('unauthenticated access to /dashboard redirects to /login', async ({ page }) => {
    await mockUnauthenticatedApp(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated access to /upload redirects to /login', async ({ page }) => {
    await mockUnauthenticatedApp(page);
    await page.goto('/upload');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated access to /settings redirects to /login', async ({ page }) => {
    await mockUnauthenticatedApp(page);
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated access to /users redirects to /login', async ({ page }) => {
    await mockUnauthenticatedApp(page);
    await page.goto('/users');
    await expect(page).toHaveURL(/\/login/);
  });

  test('authenticated admin can access /dashboard', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardData(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('non-admin access to /settings redirects to /dashboard', async ({ page }) => {
    await mockAuthenticatedAdmin(page, {
      id: 2,
      email: 'user@e2e-test.local',
      role: 'user',
    });
    await mockDashboardData(page);
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('non-admin access to /users redirects to /dashboard', async ({ page }) => {
    await mockAuthenticatedAdmin(page, {
      id: 2,
      email: 'user@e2e-test.local',
      role: 'user',
    });
    await mockDashboardData(page);
    await page.goto('/users');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
