import { test, expect } from '@playwright/test';
import { mockAuthenticatedAdmin, mockDomainsData } from '../helpers/mock-api';

test.describe('Domains Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDomainsData(page);
  });

  test('domains page loads with managed and unknown sections', async ({ page }) => {
    await page.goto('/domains');

    await expect(page).toHaveURL(/\/domains/);
    await expect(page.getByTestId('domains-container')).toBeVisible();

    // Should show managed domains section
    await expect(page.locator('text=Managed Domains')).toBeVisible();

    // Should show unknown domains section
    await expect(page.locator('text=Unknown Domains in Reports')).toBeVisible();
  });

  test('displays managed domain statistics', async ({ page }) => {
    await page.goto('/domains');

    // Should show the managed domain
    await expect(page.locator('.domains-container')).toContainText('example.com');
  });

  test('displays unknown domain statistics', async ({ page }) => {
    await page.goto('/domains');

    // Should show the unknown domain
    await expect(page.locator('.domains-container')).toContainText('unknown-sender.com');
  });

  test('add domain button is visible', async ({ page }) => {
    await page.goto('/domains');

    await expect(page.getByTestId('domains-add-button')).toBeVisible();
    await expect(page.getByTestId('domains-add-button')).toContainText('Add Domain');
  });

  test('clicking add domain opens dialog', async ({ page }) => {
    await page.goto('/domains');

    await page.getByTestId('domains-add-button').click();

    // Dialog should open
    await expect(page.locator('mat-dialog-container')).toBeVisible({ timeout: 3000 });
  });

  test('time period selector is visible', async ({ page }) => {
    await page.goto('/domains');

    await expect(page.locator('mat-select')).toBeVisible();
  });

  test('layout toggle button is visible', async ({ page }) => {
    await page.goto('/domains');

    // Layout toggle button
    await expect(page.locator('button[mat-icon-button]').first()).toBeVisible();
  });

  test('shows description text for managed domains', async ({ page }) => {
    await page.goto('/domains');

    await expect(page.locator('.domains-container')).toContainText(
      'These are the domains you have added to your list'
    );
  });
});
