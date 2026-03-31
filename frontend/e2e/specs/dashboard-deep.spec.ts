import { test, expect } from '@playwright/test';
import { mockAuthenticatedAdmin, mockDashboardDataRich } from '../helpers/mock-api';

test.describe('Dashboard Deep Tests', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardDataRich(page);
  });

  test('dashboard shows summary metric cards', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByTestId('dashboard-container')).toBeVisible();

    // Summary cards should be visible - use specific card locators
    await expect(page.locator('.summary-card:has-text("Unique Countries")')).toBeVisible();
    await expect(page.locator('.summary-card:has-text("Global Pass Rate")')).toBeVisible();
    await expect(page.locator('.summary-card:has-text("Email Records")')).toBeVisible();
  });

  test('dashboard shows DKIM and SPF summary cards', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('.summary-card.pie-chart-card').first()).toBeVisible();
    await expect(page.locator('.summary-card.pie-chart-card').nth(1)).toBeVisible();
  });

  test('dashboard shows pass rate charts', async ({ page }) => {
    await page.goto('/dashboard');

    // Chart cards should be visible
    await expect(page.locator('text=DKIM / SPF Pass Rate Over Time')).toBeVisible();
    await expect(page.locator('text=Disposition Over Time')).toBeVisible();
  });

  test('dashboard shows top countries section', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('text=Top Countries by Email Volume')).toBeVisible();

    // Should show country data
    await expect(page.locator('.countries-card')).toContainText('United States');
    await expect(page.locator('.countries-card')).toContainText('Germany');
    await expect(page.locator('.countries-card')).toContainText('United Kingdom');
  });

  test('dashboard shows top header-from domains', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('text=Top Header-From Domains')).toBeVisible();
    await expect(page.locator('.headerfrom-card')).toContainText('example.com');
    await expect(page.locator('.headerfrom-card')).toContainText('test.org');
  });

  test('dashboard shows email reports over time chart', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('text=Email Reports Over Time')).toBeVisible();
  });

  test('dashboard shows DMARC insights section', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('text=DMARC Insights & Recommendations')).toBeVisible();
    await expect(page.locator('.insights-card')).toContainText('Geographic Distribution Analysis');
    await expect(page.locator('.insights-card')).toContainText('Authentication Success Tracking');
  });

  test('country pass rates display with correct formatting', async ({ page }) => {
    await page.goto('/dashboard');

    // US has 475/500 = 95% pass rate
    await expect(page.locator('.countries-card')).toContainText('500 records');
    await expect(page.locator('.countries-card')).toContainText('95% DMARC pass');
  });

  test('header-from pass rates display correctly', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('.headerfrom-card')).toContainText('600 records');
    await expect(page.locator('.headerfrom-card')).toContainText('95% DMARC pass');
  });

  test('dashboard filter component is visible', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('app-dashboard-filter')).toBeVisible();
  });
});
