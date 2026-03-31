import { test, expect } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockDashboardData,
  mockLogout,
  mockUnauthenticatedApp,
} from '../../helpers/mock-api';

test.describe('Logout', () => {
  test('clicking logout navigates to login page', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardData(page);
    await mockLogout(page);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // After logout, the app will redirect to /login, so mock unauthenticated state
    // We need to set up the unauth mocks BEFORE clicking logout
    page.on('request', async (request) => {
      // The logout will cause the app to call check-setup and auth endpoints again
    });

    await page.getByTestId('nav-logout').click();

    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('after logout, accessing dashboard redirects to login', async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardData(page);
    await mockLogout(page);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // Click logout
    await page.getByTestId('nav-logout').click();
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });

    // Now set up unauthenticated state for the next navigation
    await page.unroute('**/api/auth/me');
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ status: 401, body: 'Unauthorized' });
    });
    await page.unroute('**/api/auth/refresh');
    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({ status: 401, body: 'Unauthorized' });
    });

    // Try to go to dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
