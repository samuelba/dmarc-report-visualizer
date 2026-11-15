import { test, expect } from '@playwright/test';
import { mockAuthenticatedAdmin, mockReportsData, mockReportXml } from '../helpers/mock-api';

test.describe('Reports Page - Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockReportsData(page);
  });

  test('domain filter dropdown lists available domains', async ({ page }) => {
    await page.goto('/reports');

    // Open the domain filter dropdown
    await page.locator('mat-select').first().click();

    await expect(page.getByRole('option', { name: 'All domains' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'example.com' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'test.org' })).toBeVisible();
  });

  test('selecting a domain filter updates the view', async ({ page }) => {
    await page.goto('/reports');

    await page.locator('mat-select').first().click();
    await page.getByRole('option', { name: 'example.com' }).click();

    // URL should update with domain filter
    await expect(page).toHaveURL(/domain=example\.com/);
  });

  test('clicking report row opens XML viewer dialog', async ({ page }) => {
    await mockReportXml(page);
    await page.goto('/reports');

    await page.locator('tr.clickable-row').first().click();

    // Dialog should open with XML content
    await expect(page.locator('mat-dialog-container')).toBeVisible({ timeout: 5000 });
  });

  test('XML viewer dialog displays XML content', async ({ page }) => {
    await mockReportXml(page);
    await page.goto('/reports');

    await page.locator('tr.clickable-row').first().click();

    await expect(page.locator('mat-dialog-container')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('mat-dialog-container')).toContainText('google.com');
    await expect(page.locator('mat-dialog-container')).toContainText('example.com');
  });

  test('reports table shows report IDs', async ({ page }) => {
    await page.goto('/reports');

    await expect(page.locator('table')).toContainText('16741234567890');
    await expect(page.locator('table')).toContainText('16741234567891');
  });

  test('reports table shows organization names', async ({ page }) => {
    await page.goto('/reports');

    await expect(page.locator('table')).toContainText('google.com');
    await expect(page.locator('table')).toContainText('outlook.com');
  });

  test('paginator shows page size options', async ({ page }) => {
    await page.goto('/reports');

    await expect(page.locator('mat-paginator')).toBeVisible();
    // The paginator should have the correct options
    await expect(page.locator('mat-paginator')).toContainText('1 –');
  });

  test('returning to page 1 removes page from the URL', async ({ page }) => {
    await page.route('**/api/dmarc-reports/list*', async (route) => {
      const url = new URL(route.request().url());
      const pageNo = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: `rpt-${pageNo}`,
              reportId: `report-page-${pageNo}`,
              orgName: 'google.com',
              domain: 'example.com',
              createdAt: '2026-03-02T12:00:00Z',
              updatedAt: '2026-03-02T12:00:00Z',
            },
          ],
          total: 60,
          page: pageNo,
          pageSize,
        }),
      });
    });

    await page.goto('/reports');
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.locator('table')).toContainText('report-page-2');

    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(page.locator('table')).toContainText('report-page-1');
    await expect(page).not.toHaveURL(/[?&]page=/);
  });
});
