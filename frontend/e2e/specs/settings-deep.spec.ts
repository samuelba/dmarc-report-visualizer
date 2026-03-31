import { test, expect } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockDashboardData,
  mockSettingsData,
  mockReprocessingInProgress,
} from '../helpers/mock-api';

test.describe('Settings Page - Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardData(page);
    await mockSettingsData(page);
  });

  test.describe('Third-Party Senders Tab', () => {
    test('senders table shows correct column headers', async ({ page }) => {
      await page.goto('/settings');

      await expect(page.locator('th')).toContainText(['Enabled', 'Name', 'DKIM Pattern', 'SPF Pattern', 'Actions']);
    });

    test('senders table displays sender data', async ({ page }) => {
      await page.goto('/settings');

      await expect(page.locator('.senders-table')).toContainText('SendGrid');
      await expect(page.locator('.senders-table')).toContainText('sendgrid.net');
    });

    test('sender has edit and delete action buttons', async ({ page }) => {
      await page.goto('/settings');

      const row = page.locator('tr.mat-mdc-row').first();
      await expect(row.locator('mat-icon:has-text("edit")')).toBeVisible();
      await expect(row.locator('mat-icon:has-text("delete")')).toBeVisible();
    });

    test('sender toggle switch is visible', async ({ page }) => {
      await page.goto('/settings');

      await expect(page.locator('mat-slide-toggle')).toBeVisible();
    });

    test('add sender button opens dialog', async ({ page }) => {
      await page.goto('/settings');

      await page.getByRole('button', { name: /add third-party sender/i }).click();

      await expect(page.locator('mat-dialog-container')).toBeVisible();
    });

    test('delete sender shows confirmation dialog', async ({ page }) => {
      await page.goto('/settings');

      // Click delete button
      await page.locator('tr.mat-mdc-row').first().locator('button[color="warn"]').click();

      await expect(page.locator('mat-dialog-container')).toBeVisible();
      await expect(page.locator('mat-dialog-container')).toContainText(/delete|remove|confirm/i);
    });
  });

  test.describe('Reprocessing Tab', () => {
    test('reprocessing tab shows date range selector', async ({ page }) => {
      await page.goto('/settings');

      // Click Reprocessing tab
      await page.getByRole('tab', { name: /reprocessing/i }).click();

      await expect(page.locator('mat-date-range-input')).toBeVisible();
    });

    test('reprocessing tab has start button', async ({ page }) => {
      await page.goto('/settings');
      await page.getByRole('tab', { name: /reprocessing/i }).click();

      await expect(page.getByRole('button', { name: /start reprocessing/i })).toBeVisible();
    });

    test('reprocessing shows current job when in progress', async ({ page }) => {
      await mockReprocessingInProgress(page);
      await page.goto('/settings');
      await page.getByRole('tab', { name: /reprocessing/i }).click();

      await expect(page.locator('.current-job')).toBeVisible();
      await expect(page.locator('.current-job')).toContainText('RUNNING');
    });

    test('reprocessing shows job history table', async ({ page }) => {
      await mockReprocessingInProgress(page);
      await page.goto('/settings');
      await page.getByRole('tab', { name: /reprocessing/i }).click();

      await expect(page.locator('.history-section')).toBeVisible();
      await expect(page.locator('.jobs-table')).toContainText('COMPLETED');
    });

    test('reprocessing shows cancel button when job is running', async ({ page }) => {
      await mockReprocessingInProgress(page);
      await page.goto('/settings');
      await page.getByRole('tab', { name: /reprocessing/i }).click();

      await expect(page.getByRole('button', { name: /cancel reprocessing/i })).toBeVisible();
    });

    test('reprocessing shows progress bar for running job', async ({ page }) => {
      await mockReprocessingInProgress(page);
      await page.goto('/settings');
      await page.getByRole('tab', { name: /reprocessing/i }).click();

      await expect(page.locator('.progress-bar')).toBeVisible();
      await expect(page.locator('.progress-text')).toContainText('45%');
    });
  });

  test.describe('Utilities Tab', () => {
    test('utilities tab shows delete old reports section', async ({ page }) => {
      await page.goto('/settings');
      await page.getByRole('tab', { name: /utilities/i }).click();

      await expect(page.locator('mat-card-title').filter({ hasText: 'Delete Old Reports' })).toBeVisible();
    });

    test('utilities tab shows warning about irreversibility', async ({ page }) => {
      await page.goto('/settings');
      await page.getByRole('tab', { name: /utilities/i }).click();

      await expect(page.locator('app-message[type="warning"]')).toContainText('irreversible');
    });

    test('utilities tab has date picker for deletion', async ({ page }) => {
      await page.goto('/settings');
      await page.getByRole('tab', { name: /utilities/i }).click();

      await expect(page.getByLabel(/delete reports older than/i)).toBeVisible();
    });

    test('delete button is disabled without date selection', async ({ page }) => {
      await page.goto('/settings');
      await page.getByRole('tab', { name: /utilities/i }).click();

      await expect(page.getByRole('button', { name: /delete old reports/i })).toBeDisabled();
    });

    test('quick date buttons are available', async ({ page }) => {
      await page.goto('/settings');
      await page.getByRole('tab', { name: /utilities/i }).click();

      await expect(page.getByRole('button', { name: /5 years ago/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /2 years ago/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /1 year ago/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /6 months ago/i })).toBeVisible();
    });

    test('clicking quick date button enables delete button', async ({ page }) => {
      await page.goto('/settings');
      await page.getByRole('tab', { name: /utilities/i }).click();

      await page.getByRole('button', { name: /1 year ago/i }).click();

      await expect(page.getByRole('button', { name: /delete old reports/i })).toBeEnabled();
    });
  });

  test.describe('Tab Navigation', () => {
    test('all five tabs are accessible', async ({ page }) => {
      await page.goto('/settings');

      for (const tabName of ['Third-Party Senders', 'Reprocessing', 'Utilities', 'SAML/SSO', 'SMTP Email']) {
        await page.getByRole('tab', { name: tabName }).click();
        await expect(page.getByRole('tab', { name: tabName })).toHaveAttribute('aria-selected', 'true');
      }
    });
  });
});
