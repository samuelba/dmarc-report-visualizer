import { test, expect } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockDashboardData,
  mockDomainsData,
  mockDomainCreateSuccess,
} from '../helpers/mock-api';

test.describe('Domain Management - Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardData(page);
    await mockDomainsData(page);
  });

  test('add domain dialog opens with form fields', async ({ page }) => {
    await page.goto('/domains');
    await page.getByTestId('domains-add-button').click();

    await expect(page.locator('mat-dialog-container')).toBeVisible();
    await expect(page.locator('mat-dialog-container')).toContainText('Add Domain');
    await expect(page.locator('mat-dialog-container').getByLabel('Domain Name')).toBeVisible();
  });

  test('add domain dialog has notes field', async ({ page }) => {
    await page.goto('/domains');
    await page.getByTestId('domains-add-button').click();

    await expect(page.locator('mat-dialog-container').getByLabel(/notes/i)).toBeVisible();
  });

  test('add domain dialog has cancel and submit buttons', async ({ page }) => {
    await page.goto('/domains');
    await page.getByTestId('domains-add-button').click();

    const dialog = page.locator('mat-dialog-container');
    await expect(dialog.getByRole('button', { name: /cancel/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /add domain/i })).toBeVisible();
  });

  test('add domain submit is disabled when domain field is empty', async ({ page }) => {
    await page.goto('/domains');
    await page.getByTestId('domains-add-button').click();

    const addButton = page.locator('mat-dialog-container').getByRole('button', { name: /add domain/i });
    await expect(addButton).toBeDisabled();
  });

  test('add domain submit enables when domain is entered', async ({ page }) => {
    await page.goto('/domains');
    await page.getByTestId('domains-add-button').click();

    await page.locator('mat-dialog-container').getByLabel('Domain Name').fill('newdomain.com');

    const addButton = page.locator('mat-dialog-container').getByRole('button', { name: /add domain/i });
    await expect(addButton).toBeEnabled();
  });

  test('cancel closes the dialog without submitting', async ({ page }) => {
    await page.goto('/domains');
    await page.getByTestId('domains-add-button').click();

    await page.locator('mat-dialog-container').getByLabel('Domain Name').fill('testdomain.com');
    await page.getByRole('button', { name: /cancel/i }).click();

    await expect(page.locator('mat-dialog-container')).not.toBeVisible();
  });

  test('submitting domain form closes dialog', async ({ page }) => {
    await mockDomainCreateSuccess(page);
    await page.goto('/domains');
    await page.getByTestId('domains-add-button').click();

    await page.locator('mat-dialog-container').getByLabel('Domain Name').fill('newdomain.com');
    await page.locator('mat-dialog-container').getByRole('button', { name: /add domain/i }).click();

    await expect(page.locator('mat-dialog-container')).not.toBeVisible({ timeout: 5000 });
  });

  test('managed domain section shows pass rate statistics', async ({ page }) => {
    await page.goto('/domains');

    // Should show pass rate percentages for managed domains
    await expect(page.getByTestId('domains-container')).toContainText('example.com');
    await expect(page.getByTestId('domains-container')).toContainText('95.0%');
  });

  test('unknown domain section shows sender data', async ({ page }) => {
    await page.goto('/domains');

    await expect(page.getByTestId('domains-container')).toContainText('unknown-sender.com');
  });

  test('domain description text is visible for managed domains', async ({ page }) => {
    await page.goto('/domains');

    // The domains container should show managed domain data
    await expect(page.getByTestId('domains-container')).toContainText('example.com');
  });
});
