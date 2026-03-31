import { test, expect } from '@playwright/test';
import { mockAuthenticatedAdmin } from '../helpers/mock-api';

test.describe('Dashboard', () => {
  test('dashboard loads with summary data', async ({ page }) => {
    await mockAuthenticatedAdmin(page);

    // Mock dashboard-specific endpoints with real-looking data
    await page.route('**/api/dmarc-reports/summary*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalReports: 42,
          totalRecords: 1337,
          passRate: 94.5,
          domains: ['example.com', 'test.org'],
        }),
      });
    });

    await page.route('**/api/domains', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'example.com' },
          { id: 2, name: 'test.org' },
        ]),
      });
    });

    await page.route('**/api/dmarc-reports/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // Dashboard container should be visible
    await expect(page.locator('.dashboard-container')).toBeVisible();
  });

  test('dashboard shows empty state when no reports exist', async ({ page }) => {
    await mockAuthenticatedAdmin(page);

    await page.route('**/api/dmarc-reports/summary*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalReports: 0,
          totalRecords: 0,
          passRate: 0,
          domains: [],
        }),
      });
    });

    await page.route('**/api/domains', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/api/dmarc-reports/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/dashboard');
    await expect(page.locator('.dashboard-container')).toBeVisible();
  });
});
