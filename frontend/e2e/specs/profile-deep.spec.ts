import { test, expect } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockDashboardData,
  mockProfileData,
  mockProfileDataWithTotp,
  mockPasswordChangeSuccess,
  mockPasswordChangeFailure,
  mockTotpSetup,
  mockTotpEnable,
  mockTotpDisable,
  mockSmtpConfig,
} from '../helpers/mock-api';

test.describe('Profile Page - Interactions', () => {
  test.describe('Password Change', () => {
    test.beforeEach(async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await mockDashboardData(page);
      await mockProfileData(page);
      await mockSmtpConfig(page);
    });

    test('password change form validates required fields', async ({ page }) => {
      await page.goto('/profile');

      const submitButton = page.getByRole('button', { name: /change password/i });
      await expect(submitButton).toBeDisabled();

      // Fill only current password
      await page.getByLabel('Current Password').fill('oldpass123');
      await expect(submitButton).toBeDisabled();
    });

    test('password change shows min length error', async ({ page }) => {
      await page.goto('/profile');

      await page.getByLabel('New Password', { exact: true }).fill('short');
      await page.getByLabel('New Password', { exact: true }).blur();

      await expect(page.getByText('Password must be at least 12 characters')).toBeVisible();
    });

    test('password change shows mismatch error', async ({ page }) => {
      await page.goto('/profile');

      await page.getByLabel('New Password', { exact: true }).fill('StrongP@ssw0rd123!');
      await page.getByLabel('Confirm New Password').fill('DifferentP@ss!');
      await page.getByLabel('Confirm New Password').blur();

      await expect(page.locator('mat-error')).toContainText('Passwords do not match');
    });

    test('password change shows same-password error', async ({ page }) => {
      await page.goto('/profile');

      await page.getByLabel('Current Password').fill('StrongP@ssw0rd123!');
      await page.getByLabel('New Password', { exact: true }).fill('StrongP@ssw0rd123!');
      await page.getByLabel('New Password', { exact: true }).blur();

      await expect(page.locator('mat-error')).toContainText('different from current');
    });

    test('successful password change shows success message', async ({ page }) => {
      await mockPasswordChangeSuccess(page);
      await page.goto('/profile');

      await page.getByLabel('Current Password').fill('OldP@ssw0rd123!');
      await page.getByLabel('New Password', { exact: true }).fill('NewP@ssw0rd123!');
      await page.getByLabel('Confirm New Password').fill('NewP@ssw0rd123!');

      await page.getByRole('button', { name: /change password/i }).click();

      await expect(page.locator('app-message[type="success"]')).toContainText('Password changed');
    });

    test('failed password change shows error message', async ({ page }) => {
      await mockPasswordChangeFailure(page, 'Current password is incorrect');
      await page.goto('/profile');

      await page.getByLabel('Current Password').fill('WrongP@ssw0rd!');
      await page.getByLabel('New Password', { exact: true }).fill('NewP@ssw0rd123!');
      await page.getByLabel('Confirm New Password').fill('NewP@ssw0rd123!');

      await page.getByRole('button', { name: /change password/i }).click();

      await expect(page.locator('app-message[type="error"]')).toContainText('incorrect');
    });

    test('password visibility toggle works', async ({ page }) => {
      await page.goto('/profile');

      const currentPwdInput = page.getByLabel('Current Password');
      await expect(currentPwdInput).toHaveAttribute('type', 'password');

      // Click visibility toggle
      await page.locator('.password-change-section').getByLabel('Hide password').first().click();

      await expect(currentPwdInput).toHaveAttribute('type', 'text');
    });
  });

  test.describe('TOTP Setup', () => {
    test.beforeEach(async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await mockDashboardData(page);
      await mockProfileData(page);
      await mockSmtpConfig(page);
    });

    test('enable 2FA button opens setup dialog', async ({ page }) => {
      await mockTotpSetup(page);
      await page.goto('/profile');

      await page.getByRole('button', { name: /enable 2fa/i }).click();

      // Dialog should open with QR code step
      await expect(page.locator('mat-dialog-container')).toBeVisible();
      await expect(page.locator('mat-dialog-container')).toContainText('Set Up Two-Factor Authentication');
    });

    test('TOTP setup shows QR code and manual secret', async ({ page }) => {
      await mockTotpSetup(page);
      await page.goto('/profile');

      await page.getByRole('button', { name: /enable 2fa/i }).click();

      await expect(page.locator('.qr-code')).toBeVisible();
      await expect(page.locator('.secret-code code')).toContainText('JBSWY3DPEHPK3PXP');
    });

    test('TOTP setup navigates from scan to verify step', async ({ page }) => {
      await mockTotpSetup(page);
      await page.goto('/profile');

      await page.getByRole('button', { name: /enable 2fa/i }).click();

      // Click Next to go to verify step
      await page.getByRole('button', { name: /next/i }).click();

      await expect(page.locator('mat-dialog-container')).toContainText('Verify Your Setup');
      await expect(page.locator('app-totp-input')).toBeVisible();
    });

    test('TOTP verify step shows recovery codes on success', async ({ page }) => {
      await mockTotpSetup(page);
      await mockTotpEnable(page);
      await page.goto('/profile');

      await page.getByRole('button', { name: /enable 2fa/i }).click();
      await page.getByRole('button', { name: /next/i }).click();

      // Enter valid 6-digit code
      const totpInput = page.locator('app-totp-input input');
      await totpInput.fill('123456');

      await page.getByRole('button', { name: /verify & enable/i }).click();

      // Should show recovery codes step
      await expect(page.locator('mat-dialog-container')).toContainText('Save Your Recovery Codes');
      await expect(page.locator('.recovery-codes-grid')).toBeVisible();
    });

    test('TOTP recovery codes step has copy and download buttons', async ({ page }) => {
      await mockTotpSetup(page);
      await mockTotpEnable(page);
      await page.goto('/profile');

      await page.getByRole('button', { name: /enable 2fa/i }).click();
      await page.getByRole('button', { name: /next/i }).click();

      const totpInput = page.locator('app-totp-input input');
      await totpInput.fill('123456');
      await page.getByRole('button', { name: /verify & enable/i }).click();

      await expect(page.getByRole('button', { name: /copy all codes/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /download/i })).toBeVisible();
    });

    test('TOTP done button requires acknowledgment checkbox', async ({ page }) => {
      await mockTotpSetup(page);
      await mockTotpEnable(page);
      await page.goto('/profile');

      await page.getByRole('button', { name: /enable 2fa/i }).click();
      await page.getByRole('button', { name: /next/i }).click();

      const totpInput = page.locator('app-totp-input input');
      await totpInput.fill('123456');
      await page.getByRole('button', { name: /verify & enable/i }).click();

      // Done button should be disabled until checkbox is checked
      const doneButton = page.getByRole('button', { name: /done/i });
      await expect(doneButton).toBeDisabled();

      await page.getByRole('checkbox').check();
      await expect(doneButton).toBeEnabled();
    });
  });

  test.describe('TOTP Enabled State', () => {
    test.beforeEach(async ({ page }) => {
      await mockAuthenticatedAdmin(page);
      await mockDashboardData(page);
      await mockProfileDataWithTotp(page);
      await mockSmtpConfig(page);
    });

    test('shows 2FA enabled status with last used date', async ({ page }) => {
      await page.goto('/profile');

      await expect(page.locator('.totp-enabled')).toBeVisible();
      await expect(page.locator('.totp-enabled')).toContainText('Two-factor authentication is enabled');
    });

    test('shows regenerate recovery codes button', async ({ page }) => {
      await page.goto('/profile');

      await expect(page.getByRole('button', { name: /regenerate recovery codes/i })).toBeVisible();
    });

    test('shows disable 2FA button', async ({ page }) => {
      await page.goto('/profile');

      await expect(page.getByRole('button', { name: /disable 2fa/i })).toBeVisible();
    });

    test('disable 2FA button opens disable dialog', async ({ page }) => {
      await page.goto('/profile');

      await page.getByRole('button', { name: /disable 2fa/i }).click();

      await expect(page.locator('mat-dialog-container')).toBeVisible();
      await expect(page.locator('mat-dialog-container')).toContainText('Disable Two-Factor Authentication');
    });

    test('disable 2FA dialog has password and TOTP fields', async ({ page }) => {
      await page.goto('/profile');

      await page.getByRole('button', { name: /disable 2fa/i }).click();

      await expect(page.locator('mat-dialog-container').getByLabel('Current Password')).toBeVisible();
      await expect(page.locator('mat-dialog-container').locator('app-totp-input')).toBeVisible();
    });

    test('disable 2FA dialog shows warning about consequences', async ({ page }) => {
      await page.goto('/profile');

      await page.getByRole('button', { name: /disable 2fa/i }).click();

      await expect(page.locator('mat-dialog-container')).toContainText('Remove the extra layer of security');
      await expect(page.locator('mat-dialog-container')).toContainText('Invalidate all your recovery codes');
    });
  });
});
