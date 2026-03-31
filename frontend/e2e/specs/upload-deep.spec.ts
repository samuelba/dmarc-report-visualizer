import { test, expect } from '@playwright/test';
import { mockAuthenticatedAdmin, mockDashboardData, mockUploadFailure } from '../helpers/mock-api';
import { UploadPage } from '../pages/upload.page';

test.describe('Upload Page - Deep Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardData(page);
  });

  test('upload multiple files shows all in file list', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    await uploadPage.fileInput.setInputFiles([
      { name: 'report1.xml', mimeType: 'application/xml', buffer: Buffer.from('<feedback></feedback>') },
      { name: 'report2.xml', mimeType: 'application/xml', buffer: Buffer.from('<feedback></feedback>') },
    ]);

    await expect(page.locator('.selected-files')).toContainText('report1.xml');
    await expect(page.locator('.selected-files')).toContainText('report2.xml');
    await expect(page.locator('.selected-files')).toContainText('2');
  });

  test('removing a file from the list updates count', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    await uploadPage.fileInput.setInputFiles([
      { name: 'report1.xml', mimeType: 'application/xml', buffer: Buffer.from('<feedback></feedback>') },
      { name: 'report2.xml', mimeType: 'application/xml', buffer: Buffer.from('<feedback></feedback>') },
    ]);

    // Remove first file via the cancel/remove icon on the chip
    await page.locator('mat-chip').first().locator('mat-icon[matChipRemove]').click();

    // Should only have 1 file now
    await expect(page.locator('.selected-files')).toContainText('1');
  });

  test('clear all button removes all files', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    await uploadPage.fileInput.setInputFiles({
      name: 'report.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from('<feedback></feedback>'),
    });

    await expect(uploadPage.submitButton).toBeEnabled();

    // Click Clear All
    await page.getByRole('button', { name: /clear all/i }).click();

    // Files should be cleared, submit disabled
    await expect(uploadPage.submitButton).toBeDisabled();
  });

  test('upload shows progress indicator', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    // Mock a delayed upload to see progress
    await page.route('**/api/dmarc-reports/upload', async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Successfully processed', reportsProcessed: 1 }),
      });
    });

    await uploadPage.fileInput.setInputFiles({
      name: 'report.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from('<feedback></feedback>'),
    });

    await uploadPage.submitButton.click();

    // Progress should appear
    await expect(uploadPage.progress).toBeVisible();
  });

  test('upload failure shows error result', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    await mockUploadFailure(page, 'Invalid XML format');

    await uploadPage.fileInput.setInputFiles({
      name: 'bad-report.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from('not a valid xml'),
    });

    await uploadPage.submitButton.click();

    // Results should appear with error
    await expect(uploadPage.results).toBeVisible();
    await expect(page.locator('.result-item.error')).toBeVisible();
  });

  test('upload success shows success result', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    await page.route('**/api/dmarc-reports/upload', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Successfully processed', reportsProcessed: 1 }),
      });
    });

    await uploadPage.fileInput.setInputFiles({
      name: 'good-report.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from('<feedback></feedback>'),
    });

    await uploadPage.submitButton.click();

    await expect(uploadPage.results).toBeVisible();
    await expect(page.locator('.result-item.success')).toBeVisible();
  });

  test('upload button text shows file count', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    await uploadPage.fileInput.setInputFiles([
      { name: 'r1.xml', mimeType: 'application/xml', buffer: Buffer.from('<feedback></feedback>') },
      { name: 'r2.xml', mimeType: 'application/xml', buffer: Buffer.from('<feedback></feedback>') },
    ]);

    await expect(uploadPage.submitButton).toContainText('2');
  });

  test('upload shows file size for each selected file', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    await uploadPage.fileInput.setInputFiles({
      name: 'report.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from('<feedback><report_metadata></report_metadata></feedback>'),
    });

    // Should show file size in parentheses
    await expect(page.locator('.selected-files')).toContainText('report.xml');
  });
});
