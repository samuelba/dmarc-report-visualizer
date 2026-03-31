import { test, expect } from '@playwright/test';
import { mockAuthenticatedAdmin, mockDashboardData } from '../helpers/mock-api';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardData(page);
  });

  test('navigation sidebar shows all expected links for admin', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByTestId('nav-dashboard')).toBeVisible();
    await expect(page.getByTestId('nav-explore')).toBeVisible();
    await expect(page.getByTestId('nav-domains')).toBeVisible();
    await expect(page.getByTestId('nav-reports')).toBeVisible();
    await expect(page.getByTestId('nav-upload')).toBeVisible();
    await expect(page.getByTestId('nav-settings')).toBeVisible();
    await expect(page.getByTestId('nav-profile')).toBeVisible();
    await expect(page.getByTestId('nav-users')).toBeVisible();
    await expect(page.getByTestId('nav-logout')).toBeVisible();
  });

  test('clicking dashboard nav link navigates to /dashboard', async ({ page }) => {
    await page.goto('/upload');
    await page.getByTestId('nav-dashboard').click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('clicking upload nav link navigates to /upload', async ({ page }) => {
    // Mock upload page API calls
    await page.route('**/api/dmarc-reports/upload', async (route) => {
      await route.fulfill({ status: 200, body: '{}' });
    });

    await page.goto('/dashboard');
    await page.getByTestId('nav-upload').click();
    await expect(page).toHaveURL(/\/upload/);
  });

  test('non-admin user does not see settings and users nav links', async ({ page }) => {
    // Re-mock as regular user
    await page.unroute('**/api/auth/me');
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 2,
          email: 'user@e2e-test.local',
          role: 'user',
        }),
      });
    });

    await page.goto('/dashboard');

    await expect(page.getByTestId('nav-dashboard')).toBeVisible();
    await expect(page.getByTestId('nav-settings')).not.toBeVisible();
    await expect(page.getByTestId('nav-users')).not.toBeVisible();
  });
});
