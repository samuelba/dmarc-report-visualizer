import { test, expect } from '@playwright/test';
import { mockAuthenticatedAdmin, mockExploreData } from '../helpers/mock-api';

test.describe('Explore Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockExploreData(page);
  });

  test('explore page loads with filter section and data table', async ({ page }) => {
    await page.goto('/explore');

    await expect(page).toHaveURL(/\/explore/);
    await expect(page.getByTestId('explore-container')).toBeVisible();

    // Filters section should be visible
    await expect(page.locator('.filters')).toBeVisible();

    // Table should be visible with data
    await expect(page.locator('table')).toBeVisible();
  });

  test('table displays records from mock data', async ({ page }) => {
    await page.goto('/explore');

    // Wait for table to render
    await expect(page.locator('table')).toBeVisible();

    // Should show record IPs
    await expect(page.locator('table')).toContainText('192.168.1.1');
    await expect(page.locator('table')).toContainText('10.0.0.1');
  });

  test('filter section has apply and clear buttons', async ({ page }) => {
    await page.goto('/explore');

    await expect(page.getByTestId('explore-apply')).toBeVisible();
    await expect(page.getByTestId('explore-clear')).toBeVisible();
  });

  test('table shows disposition values', async ({ page }) => {
    await page.goto('/explore');

    await expect(page.locator('table')).toContainText('none');
    await expect(page.locator('table')).toContainText('quarantine');
  });

  test('table shows country names', async ({ page }) => {
    await page.goto('/explore');

    // Country codes are converted to names
    await expect(page.locator('table')).toContainText('United States');
    await expect(page.locator('table')).toContainText('Germany');
  });

  test('table shows reporting org names', async ({ page }) => {
    await page.goto('/explore');

    await expect(page.locator('table')).toContainText('Google');
    await expect(page.locator('table')).toContainText('Microsoft');
  });

  test('paginator is visible', async ({ page }) => {
    await page.goto('/explore');

    await expect(page.locator('mat-paginator')).toBeVisible();
  });

  test('clear button resets filters', async ({ page }) => {
    await page.goto('/explore');

    // Click clear
    await page.getByTestId('explore-clear').click();

    // Filters should still be visible (page doesn't navigate away)
    await expect(page.getByTestId('explore-container')).toBeVisible();
  });

  test('table shows header-from domains', async ({ page }) => {
    await page.goto('/explore');

    await expect(page.locator('table')).toContainText('example.com');
    await expect(page.locator('table')).toContainText('test.org');
  });

  test('clicking a row opens record details dialog', async ({ page }) => {
    // Mock the record-by-id endpoint for when dialog opens
    await page.route('**/api/dmarc-reports/record/rec-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'rec-1',
          sourceIp: '192.168.1.1',
          count: 42,
          disposition: 'none',
          headerFrom: 'example.com',
          geoCountry: 'US',
          geoIsp: 'Google LLC',
          dkimResults: [{ domain: 'example.com', result: 'pass', selector: 's1' }],
          spfResults: [{ domain: 'example.com', result: 'pass', scope: 'mfrom' }],
          report: { id: 'rpt-1', orgName: 'Google', beginDate: '2026-03-01T00:00:00Z', domain: 'example.com' },
        }),
      });
    });

    await page.goto('/explore');

    // Click the first data row
    await page.locator('tr.clickable-row').first().click();

    // Record details dialog should open
    await expect(page.locator('mat-dialog-container')).toBeVisible({ timeout: 3000 });
  });
});
