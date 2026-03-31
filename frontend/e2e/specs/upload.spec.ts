import { test, expect } from '@playwright/test';
import { mockAuthenticatedAdmin, mockDashboardData } from '../helpers/mock-api';
import { UploadPage } from '../pages/upload.page';

test.describe('Upload Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardData(page);
  });

  test('upload page loads for authenticated user', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    await expect(page).toHaveURL(/\/upload/);
    await expect(uploadPage.dropzone).toBeVisible();
    await expect(page.locator('.upload-card')).toContainText('Upload DMARC Reports');
  });

  test('upload button is disabled when no files selected', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    await expect(uploadPage.submitButton).toBeDisabled();
  });

  test('selecting a file shows it in the file list', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    // Create a test file and upload it via the hidden input
    await uploadPage.fileInput.setInputFiles({
      name: 'test-report.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from('<feedback><report_metadata><org_name>Test</org_name></report_metadata></feedback>'),
    });

    // File should appear in the selected files list
    await expect(page.locator('.selected-files')).toContainText('test-report.xml');
    await expect(uploadPage.submitButton).toBeEnabled();
  });

  test('upload succeeds with valid file', async ({ page }) => {
    const uploadPage = new UploadPage(page);
    await uploadPage.goto();

    // Mock the upload endpoint
    await page.route('**/api/dmarc-reports/upload', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Successfully processed',
          reportsProcessed: 1,
        }),
      });
    });

    // Select file
    await uploadPage.fileInput.setInputFiles({
      name: 'test-report.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from('<feedback><report_metadata><org_name>Test</org_name></report_metadata></feedback>'),
    });

    // Click upload
    await uploadPage.submitButton.click();

    // Should show results
    await expect(uploadPage.results).toBeVisible();
  });
});
