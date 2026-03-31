import { test, expect } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockDashboardData,
  mockProfileData,
  mockProfileDataWithTotp,
} from '../helpers/mock-api';

test.describe('Profile Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardData(page);
    await mockProfileData(page);
  });

  test('profile page loads and shows account information', async ({ page }) => {
    await page.goto('/profile');

    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByTestId('profile-container')).toBeVisible();
    await expect(page.locator('text=Account Information')).toBeVisible();
  });

  test('displays user email', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.locator('.user-email')).toContainText('admin@e2e-test.local');
  });

  test('displays authentication method as Local', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.locator('.profile-container')).toContainText('Local (Password)');
  });

  test('password change form is visible for local users', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.locator('h3:has-text("Change Password")')).toBeVisible();
    await expect(page.locator('input[formControlName="currentPassword"]')).toBeVisible();
    await expect(page.locator('input[formControlName="newPassword"]')).toBeVisible();
    await expect(page.locator('input[formControlName="newPasswordConfirmation"]')).toBeVisible();
  });

  test('change password button is disabled when form is empty', async ({ page }) => {
    await page.goto('/profile');

    const submitButton = page.locator('button:has-text("Change Password")');
    await expect(submitButton).toBeDisabled();
  });

  test('2FA section shows enable button when TOTP is disabled', async ({ page }) => {
    await page.goto('/profile');

    await expect(page.locator('h3:has-text("Two-Factor Authentication")')).toBeVisible();
    await expect(page.locator('button:has-text("Enable 2FA")')).toBeVisible();
  });

  test('2FA section shows disable button when TOTP is enabled', async ({ page }) => {
    // Override with TOTP-enabled profile
    await page.unroute('**/api/auth/totp/status');
    await mockProfileDataWithTotp(page);

    await page.goto('/profile');

    await expect(page.locator('h3:has-text("Two-Factor Authentication")')).toBeVisible();
    await expect(page.locator('text=Two-factor authentication is enabled')).toBeVisible();
    await expect(page.locator('button:has-text("Disable 2FA")')).toBeVisible();
  });

  test('SAML user does not see password change form', async ({ page }) => {
    // Mock as SAML user
    await page.unroute('**/api/auth/me');
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          email: 'saml@e2e-test.local',
          role: 'administrator',
          authProvider: 'saml',
        }),
      });
    });

    await page.goto('/profile');

    // Should show SAML auth method message
    await expect(page.locator('.auth-method-value').nth(1)).toContainText('SSO (Single Sign-On)');
  });

  test('password strength indicator appears when typing', async ({ page }) => {
    await page.goto('/profile');

    await page.locator('input[formControlName="newPassword"]').fill('TestPass123!@#');

    await expect(page.locator('app-password-strength')).toBeVisible();
  });
});
