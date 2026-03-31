import { test, expect } from '@playwright/test';
import { SetupPage } from '../../pages/setup.page';
import { mockFreshApp, mockSetupSuccess, mockDashboardData } from '../../helpers/mock-api';

test.describe('Setup', () => {
  test('setup page renders when DB is empty', async ({ page }) => {
    await mockFreshApp(page);

    const setupPage = new SetupPage(page);
    await setupPage.goto();

    await expect(setupPage.card).toContainText('Initial Setup');
    await expect(setupPage.card).toContainText('Create your administrator account');
    await expect(setupPage.emailInput).toBeVisible();
    await expect(setupPage.passwordInput).toBeVisible();
    await expect(setupPage.confirmPasswordInput).toBeVisible();
  });

  test('submit button is disabled when form is empty', async ({ page }) => {
    await mockFreshApp(page);

    const setupPage = new SetupPage(page);
    await setupPage.goto();

    await expect(setupPage.submitButton).toBeDisabled();
  });

  test('password strength indicator appears when typing password', async ({ page }) => {
    await mockFreshApp(page);

    const setupPage = new SetupPage(page);
    await setupPage.goto();

    await setupPage.passwordInput.fill('TestP@ssw0rd!123');

    // The password strength component should be visible
    await expect(page.locator('app-password-strength')).toBeVisible();
  });

  test('shows error when passwords do not match', async ({ page }) => {
    await mockFreshApp(page);

    const setupPage = new SetupPage(page);
    await setupPage.goto();

    await setupPage.emailInput.fill('admin@example.com');
    await setupPage.passwordInput.fill('TestP@ssw0rd!123');
    await setupPage.confirmPasswordInput.fill('DifferentPassword!123');
    // Trigger validation by blurring
    await setupPage.emailInput.click();

    await expect(page.locator('.setup-card')).toContainText('Passwords do not match');
  });
});
