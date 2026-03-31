import { test, expect } from '@playwright/test';
import { mockAuthenticatedAdmin, mockReportsData } from '../helpers/mock-api';

test.describe('Reports Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockReportsData(page);
  });

  test('reports page loads and displays table', async ({ page }) => {
    await page.goto('/reports');

    await expect(page).toHaveURL(/\/reports/);
    await expect(page.getByTestId('reports-container')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  test('reports table shows report data', async ({ page }) => {
    await page.goto('/reports');

    await expect(page.locator('table')).toContainText('example.com');
    await expect(page.locator('table')).toContainText('test.org');
    await expect(page.locator('table')).toContainText('google.com');
    await expect(page.locator('table')).toContainText('outlook.com');
  });

  test('domain filter dropdown is visible', async ({ page }) => {
    await page.goto('/reports');

    await expect(page.locator('mat-select').first()).toBeVisible();
  });

  test('paginator is visible', async ({ page }) => {
    await page.goto('/reports');

    await expect(page.locator('mat-paginator')).toBeVisible();
  });

  test('table has correct column headers', async ({ page }) => {
    await page.goto('/reports');

    await expect(page.locator('table')).toContainText('Domain');
    await expect(page.locator('table')).toContainText('Reporting Org');
    await expect(page.locator('table')).toContainText('Report ID');
    await expect(page.locator('table')).toContainText('Begin');
    await expect(page.locator('table')).toContainText('End');
  });

  test('clicking a report row opens XML viewer dialog', async ({ page }) => {
    // Mock the XML endpoint
    await page.route('**/api/dmarc-reports/report/rpt-1/xml', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/xml',
        body: '<?xml version="1.0"?><feedback><report_metadata><org_name>google.com</org_name></report_metadata></feedback>',
      });
    });

    // Mock findOne for report details
    await page.route('**/api/dmarc-reports/report/rpt-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'rpt-1',
          reportId: '16741234567890',
          orgName: 'google.com',
          domain: 'example.com',
          beginDate: '2026-03-01T00:00:00Z',
          endDate: '2026-03-02T00:00:00Z',
          records: [],
          createdAt: '2026-03-02T12:00:00Z',
          updatedAt: '2026-03-02T12:00:00Z',
        }),
      });
    });

    await page.goto('/reports');

    // Click the first data row
    await page.locator('tr.clickable-row').first().click();

    // XML viewer dialog should open
    await expect(page.locator('mat-dialog-container')).toBeVisible({ timeout: 3000 });
  });
});
