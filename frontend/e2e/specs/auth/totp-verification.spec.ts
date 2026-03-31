import { test, expect } from '@playwright/test';
import {
  mockUnauthenticatedApp,
  mockDashboardData,
  mockTotpVerifySuccess,
  mockTotpVerifyFailure,
  mockRecoveryCodeSuccess,
  mockRecoveryCodeFailure,
} from '../../helpers/mock-api';

test.describe('TOTP Verification', () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticatedApp(page);

    // The TOTP page is accessed after login when 2FA is required.
    // Mock the auth state as having a temp token (user lands on /totp-verification).
    // The setup guard / check-setup won't block, and auth guard doesn't apply to this public route.
  });

  test('TOTP verification page renders with code input', async ({ page }) => {
    await page.goto('/totp-verification');

    await expect(page.getByTestId('totp-container')).toBeVisible();
    await expect(page.locator('.verification-card')).toContainText('Two-Factor Authentication');
    await expect(page.locator('.verification-card')).toContainText('Enter your verification code');
    await expect(page.getByTestId('totp-submit')).toBeVisible();
    await expect(page.getByTestId('totp-toggle-mode')).toBeVisible();
  });

  test('toggle switches to recovery code mode', async ({ page }) => {
    await page.goto('/totp-verification');

    // Initially in TOTP mode
    await expect(page.locator('.verification-card')).toContainText('Enter your verification code');

    // Click toggle
    await page.getByTestId('totp-toggle-mode').click();

    // Now in recovery code mode
    await expect(page.locator('.verification-card')).toContainText('Enter your recovery code');
    await expect(page.getByTestId('recovery-code-input')).toBeVisible();

    // Toggle back
    await page.getByTestId('totp-toggle-mode').click();
    await expect(page.locator('.verification-card')).toContainText('Enter your verification code');
  });

  test('successful TOTP verification redirects to dashboard', async ({ page }) => {
    await mockDashboardData(page);
    await mockTotpVerifySuccess(page);

    await page.goto('/totp-verification');

    // TOTP input is a single input with maxlength=6
    await page.locator('app-totp-input input').fill('123456');

    await page.getByTestId('totp-submit').click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });

  test('failed TOTP verification shows error', async ({ page }) => {
    await mockTotpVerifyFailure(page);

    await page.goto('/totp-verification');

    // TOTP input is a single input with maxlength=6
    await page.locator('app-totp-input input').fill('999999');

    await page.getByTestId('totp-submit').click();

    await expect(page.getByTestId('totp-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('totp-error')).toContainText('Invalid verification code');
  });

  test('successful recovery code redirects to dashboard', async ({ page }) => {
    await mockDashboardData(page);
    await mockRecoveryCodeSuccess(page);

    await page.goto('/totp-verification');

    // Switch to recovery code mode
    await page.getByTestId('totp-toggle-mode').click();

    // Fill recovery code
    await page.getByTestId('recovery-code-input').fill('ABCD-1234-EFGH-5678');

    await page.getByTestId('totp-submit').click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });

  test('failed recovery code shows error', async ({ page }) => {
    await mockRecoveryCodeFailure(page);

    await page.goto('/totp-verification');

    // Switch to recovery code mode
    await page.getByTestId('totp-toggle-mode').click();

    // Fill recovery code
    await page.getByTestId('recovery-code-input').fill('AAAA-BBBB-CCCC-DDDD');

    await page.getByTestId('totp-submit').click();

    await expect(page.getByTestId('totp-error')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('totp-error')).toContainText('Invalid recovery code');
  });

  test('toggle mode button text changes correctly', async ({ page }) => {
    await page.goto('/totp-verification');

    // In TOTP mode, button says "Use recovery code instead"
    await expect(page.getByTestId('totp-toggle-mode')).toContainText('Use recovery code instead');

    await page.getByTestId('totp-toggle-mode').click();

    // In recovery mode, button says "Use authenticator app instead"
    await expect(page.getByTestId('totp-toggle-mode')).toContainText('Use authenticator app instead');
  });
});
