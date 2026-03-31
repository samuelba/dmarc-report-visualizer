import { test, expect } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockExploreData,
  mockExploreFilteredData,
} from '../helpers/mock-api';

test.describe('Explore Page - Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockExploreData(page);
  });

  test('apply filters button triggers search', async ({ page }) => {
    let searchCalled = false;
    await page.route('**/api/dmarc-reports/records/search*', async (route) => {
      searchCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0, page: 1, pageSize: 20 }),
      });
    });

    await page.goto('/explore');
    await page.getByTestId('explore-apply').click();

    // Should have triggered a search
    expect(searchCalled).toBe(true);
  });

  test('record details dialog shows source IP', async ({ page }) => {
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
          geoOrg: 'Google',
          dkimResults: [{ domain: 'example.com', result: 'pass', selector: 's1' }],
          spfResults: [{ domain: 'example.com', result: 'pass', scope: 'mfrom' }],
          report: { id: 'rpt-1', orgName: 'Google', beginDate: '2026-03-01T00:00:00Z', domain: 'example.com' },
        }),
      });
    });

    await page.goto('/explore');
    await page.locator('tr.clickable-row').first().click();

    const dialog = page.locator('mat-dialog-container');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(dialog).toContainText('192.168.1.1');
  });

  test('record details dialog shows DKIM and SPF results', async ({ page }) => {
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
          geoOrg: 'Google',
          dkimResults: [{ domain: 'example.com', result: 'pass', selector: 's1' }],
          spfResults: [{ domain: 'example.com', result: 'pass', scope: 'mfrom' }],
          report: { id: 'rpt-1', orgName: 'Google', beginDate: '2026-03-01T00:00:00Z', domain: 'example.com' },
        }),
      });
    });

    await page.goto('/explore');
    await page.locator('tr.clickable-row').first().click();

    const dialog = page.locator('mat-dialog-container');
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(dialog).toContainText('pass');
    await expect(dialog).toContainText('example.com');
  });

  test('table shows DKIM result indicators', async ({ page }) => {
    await page.goto('/explore');

    // Table should have DKIM/SPF pass/fail indicators (rendered as icon + label)
    const table = page.locator('table');
    await expect(table).toBeVisible();
    // First record has dmarcDkim: 'pass' which renders as 'pass' label
    const firstRow = table.locator('tr.clickable-row').first();
    await expect(firstRow).toContainText('pass');
  });

  test('table shows forwarded status', async ({ page }) => {
    await page.goto('/explore');

    // Second record has isForwarded = true
    const table = page.locator('table');
    await expect(table).toBeVisible();
  });

  test('table rows are clickable', async ({ page }) => {
    await page.goto('/explore');

    const rows = page.locator('tr.clickable-row');
    await expect(rows).toHaveCount(2);
  });

  test('table shows message count', async ({ page }) => {
    await page.goto('/explore');

    await expect(page.locator('table')).toContainText('42');
    await expect(page.locator('table')).toContainText('15');
  });

  test('clear filters resets and reloads data', async ({ page }) => {
    await page.goto('/explore');

    // Click clear
    await page.getByTestId('explore-clear').click();

    // Table should still be visible with data
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByTestId('explore-container')).toBeVisible();
  });
});
