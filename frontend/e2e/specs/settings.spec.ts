import { test, expect } from '@playwright/test';
import { mockAuthenticatedAdmin, mockDashboardData, mockSettingsData } from '../helpers/mock-api';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardData(page);
    await mockSettingsData(page);
  });

  test('settings page loads with tab group', async ({ page }) => {
    await page.goto('/settings');

    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByTestId('settings-container')).toBeVisible();
  });

  test('third-party senders tab is visible and shows data', async ({ page }) => {
    await page.goto('/settings');

    // First tab should be active by default
    await expect(page.locator('text=Email Service Providers')).toBeVisible();
    await expect(page.locator('.senders-table')).toContainText('SendGrid');
  });

  test('add third-party sender button is visible', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.locator('button:has-text("Add Third-Party Sender")')).toBeVisible();
  });

  test('reprocessing tab is accessible', async ({ page }) => {
    await page.goto('/settings');

    // Click the Reprocessing tab
    await page.locator('div[role="tab"]:has-text("Reprocessing")').click();

    await expect(page.locator('text=Reprocess DMARC Records')).toBeVisible();
    await expect(page.locator('button:has-text("Start Reprocessing")')).toBeVisible();
  });

  test('utilities tab is accessible', async ({ page }) => {
    await page.goto('/settings');

    // Click the Utilities tab
    await page.locator('div[role="tab"]:has-text("Utilities")').click();

    await expect(page.locator('mat-card-title:has-text("Delete Old Reports")')).toBeVisible();
  });

  test('SAML/SSO tab is accessible', async ({ page }) => {
    // Mock SAML config endpoint
    await page.route('**/api/auth/saml/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entryPoint: '',
          issuer: '',
          cert: '',
          enabled: false,
          disablePasswordLogin: false,
        }),
      });
    });

    await page.goto('/settings');

    await page.locator('div[role="tab"]:has-text("SAML")').click();

    await expect(page.locator('app-saml-settings')).toBeVisible();
  });

  test('SMTP Email tab is accessible', async ({ page }) => {
    // Mock SMTP config endpoint
    await page.route('**/api/smtp/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          host: '',
          port: 587,
          secure: false,
          auth: { user: '', pass: '' },
          from: '',
          enabled: false,
        }),
      });
    });

    await page.goto('/settings');

    await page.locator('div[role="tab"]:has-text("SMTP")').click();

    await expect(page.locator('app-smtp-settings')).toBeVisible();
  });

  test('senders table shows enabled toggle', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.locator('mat-slide-toggle')).toBeVisible();
  });

  test('non-admin is redirected away from settings', async ({ page }) => {
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

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
