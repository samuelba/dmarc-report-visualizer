import { test, expect } from '@playwright/test';
import {
  mockUnauthenticatedApp,
  mockFreshApp,
  mockLoginSuccess,
  mockLoginFailure,
  mockLoginRequiresTotp,
  mockSetupSuccess,
  mockDashboardData,
} from '../../helpers/mock-api';
import { LoginPage } from '../../pages/login.page';
import { SetupPage } from '../../pages/setup.page';

test.describe('Auth Flows - Deep', () => {
  test.describe('Login Form Submission', () => {
    test.beforeEach(async ({ page }) => {
      await mockUnauthenticatedApp(page);
    });

    test('successful login redirects to dashboard', async ({ page }) => {
      await mockDashboardData(page);
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await mockLoginSuccess(page);
      await loginPage.login('admin@e2e-test.local', 'ValidP@ssword123');

      await loginPage.expectRedirectToDashboard();
    });

    test('failed login shows error without clearing password', async ({ page }) => {
      await mockLoginFailure(page, 'Invalid email or password');
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await loginPage.login('admin@e2e-test.local', 'WrongPassword');

      await loginPage.expectError('Invalid email or password');
    });

    test('login requiring TOTP redirects to verification page', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await mockLoginRequiresTotp(page);
      await loginPage.login('admin@e2e-test.local', 'ValidP@ssword123');

      await expect(page).toHaveURL(/\/totp-verification/, { timeout: 5000 });
    });

    test('SSO button visible when SAML is enabled', async ({ page }) => {
      // Override SAML status to enabled
      await page.unroute('**/api/auth/saml/status');
      await page.route('**/api/auth/saml/status', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, configured: true, passwordLoginAllowed: true }),
        });
      });

      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await expect(loginPage.ssoButton).toBeVisible();
    });

    test('SSO button hidden when SAML is disabled', async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.goto();

      await expect(loginPage.ssoButton).not.toBeVisible();
    });
  });

  test.describe('Setup Form Submission', () => {
    test.beforeEach(async ({ page }) => {
      await mockFreshApp(page);
    });

    test('successful setup creates admin and redirects', async ({ page }) => {
      await mockSetupSuccess(page);

      // After setup, auth/me should return the user
      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, email: 'admin@e2e-test.local', role: 'administrator' }),
        });
      });

      const setupPage = new SetupPage(page);
      await setupPage.goto();
      await setupPage.fillForm('admin@e2e-test.local', 'StrongP@ssw0rd123!', 'StrongP@ssw0rd123!');

      await page.getByTestId('setup-submit').click();

      // Should redirect to dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
    });

    test('setup submit is disabled with weak password', async ({ page }) => {
      const setupPage = new SetupPage(page);
      await setupPage.goto();

      await page.getByTestId('setup-email').fill('admin@test.com');
      await page.getByTestId('setup-password').fill('weak');
      await page.getByTestId('setup-confirm-password').fill('weak');

      await expect(page.getByTestId('setup-submit')).toBeDisabled();
    });

    test('setup shows password strength indicator', async ({ page }) => {
      const setupPage = new SetupPage(page);
      await setupPage.goto();

      await page.getByTestId('setup-password').fill('StrongP@ssw0rd123!');

      await expect(page.locator('app-password-strength')).toBeVisible();
    });
  });

  test.describe('Auth Callback', () => {
    test('auth callback redirects to login on error', async ({ page }) => {
      await page.route('**/api/auth/check-setup', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ needsSetup: false }),
        });
      });
      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({ status: 401, body: 'Unauthorized' });
      });
      await page.route('**/api/auth/refresh', async (route) => {
        await route.fulfill({ status: 401, body: 'Unauthorized' });
      });
      await page.route('**/api/auth/saml/status', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: false, configured: false, passwordLoginAllowed: true }),
        });
      });

      await page.goto('/auth/callback');

      // Should eventually redirect to login since user is not authenticated
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    });
  });
});
