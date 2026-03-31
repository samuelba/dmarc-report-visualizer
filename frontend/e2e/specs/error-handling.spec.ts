import { test, expect } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockUnauthenticatedApp,
  mockDashboardData,
  mockExploreData,
  mockReportsData,
  mockDomainsData,
  mockAuthenticatedUser,
} from '../helpers/mock-api';

test.describe('Error Handling & Edge Cases', () => {
  test.describe('API Error Responses', () => {
    test('dashboard handles API error gracefully', async ({ page }) => {
      await mockAuthenticatedAdmin(page);

      // Mock all dashboard APIs to return errors
      await page.route('**/api/dmarc-reports/**', async (route) => {
        await route.fulfill({ status: 500, body: 'Internal Server Error' });
      });
      await page.route('**/api/domains', async (route) => {
        await route.fulfill({ status: 500, body: 'Internal Server Error' });
      });

      await page.goto('/dashboard');

      // Page should still render without crashing
      await expect(page.getByTestId('dashboard-container')).toBeVisible();
    });

    test('explore page handles search error', async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await page.route('**/api/dmarc-reports/records/distinct*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });
      await page.route('**/api/dmarc-reports/records/search*', async (route) => {
        await route.fulfill({ status: 500, body: 'Server Error' });
      });
      await page.route('**/api/domains', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/explore');

      // Page should still render
      await expect(page.getByTestId('explore-container')).toBeVisible();
    });

    test('reports page handles list error', async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await page.route('**/api/dmarc-reports/report-domains', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ domains: [] }),
        });
      });
      await page.route('**/api/dmarc-reports/list*', async (route) => {
        await route.fulfill({ status: 500, body: 'Server Error' });
      });

      await page.goto('/reports');

      await expect(page.getByTestId('reports-container')).toBeVisible();
    });
  });

  test.describe('Session & Auth Edge Cases', () => {
    test('token refresh failure redirects to login', async ({ page }) => {
      await page.route('**/api/auth/check-setup', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ needsSetup: false }),
        });
      });
      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({ status: 401, body: 'Unauthorized' });
      });
      await page.route('**/api/auth/refresh', async (route) => {
        await route.fulfill({ status: 401, body: 'Unauthorized' });
      });
      await page.route('**/api/auth/saml/status', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: false, configured: false, passwordLoginAllowed: true }),
        });
      });

      await page.goto('/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test('unknown route redirects to dashboard for authenticated user', async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await mockDashboardData(page);

      await page.goto('/nonexistent-page');

      // Should redirect to dashboard or show the app
      await expect(page).toHaveURL(/\/(dashboard|login)/);
    });
  });

  test.describe('Empty States', () => {
    test('reports page with no reports shows empty table', async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await page.route('**/api/dmarc-reports/report-domains', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ domains: [] }),
        });
      });
      await page.route('**/api/dmarc-reports/list*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20 }),
        });
      });

      await page.goto('/reports');
      await expect(page.getByTestId('reports-container')).toBeVisible();
    });

    test('explore page with no records shows empty table', async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await page.route('**/api/dmarc-reports/records/distinct*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });
      await page.route('**/api/dmarc-reports/records/search*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20 }),
        });
      });
      await page.route('**/api/domains', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/explore');
      await expect(page.getByTestId('explore-container')).toBeVisible();
    });

    test('domains page with no domains shows empty state', async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await page.route('**/api/domains/statistics*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });
      await page.route('**/api/domains', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/domains');
      await expect(page.getByTestId('domains-container')).toBeVisible();
    });

    test('user management with no pending invites', async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await page.route('**/api/auth/users', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, email: 'admin@e2e-test.local', role: 'administrator', authProvider: 'local', createdAt: '2026-01-01T00:00:00Z' },
          ]),
        });
      });
      await page.route('**/api/auth/invites', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });
      await page.route('**/api/auth/saml/status', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: false, configured: false, passwordLoginAllowed: true }),
        });
      });

      await page.goto('/users');
      await expect(page.getByTestId('user-management-container')).toBeVisible();
    });

    test('settings with no third-party senders shows empty state', async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await page.route('**/api/settings/third-party-senders', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });
      await page.route('**/api/reprocessing/current', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      });
      await page.route('**/api/reprocessing/jobs', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto('/settings');
      await expect(page.locator('.empty-state')).toBeVisible();
      await expect(page.locator('.empty-state')).toContainText('No third-party senders');
    });
  });

  test.describe('Role-Based Access', () => {
    test('non-admin user cannot see settings nav link', async ({ page }) => {
      await mockAuthenticatedUser(page);
      await mockDashboardData(page);

      await page.goto('/dashboard');

      await expect(page.getByTestId('nav-settings')).not.toBeVisible();
    });

    test('non-admin user cannot see users nav link', async ({ page }) => {
      await mockAuthenticatedUser(page);
      await mockDashboardData(page);

      await page.goto('/dashboard');

      await expect(page.getByTestId('nav-users')).not.toBeVisible();
    });

    test('non-admin user can see upload and explore nav links', async ({ page }) => {
      await mockAuthenticatedUser(page);
      await mockDashboardData(page);

      await page.goto('/dashboard');

      await expect(page.getByTestId('nav-upload')).toBeVisible();
      await expect(page.getByTestId('nav-explore')).toBeVisible();
    });
  });
});
