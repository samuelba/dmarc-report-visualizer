import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import {
  mockUnauthenticatedApp,
  mockLoginSuccess,
  mockLoginFailure,
  mockAuthenticatedAdmin,
  mockDashboardData,
} from '../../helpers/mock-api';

test.describe('Login', () => {
  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await mockUnauthenticatedApp(page);
    await mockDashboardData(page);

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Set up login success mock before submitting
    await mockLoginSuccess(page);
    await loginPage.login('admin@e2e-test.local', 'TestP@ssw0rd!');

    await loginPage.expectRedirectToDashboard();
  });

  test('login with invalid credentials shows error message', async ({ page }) => {
    await mockUnauthenticatedApp(page);

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await mockLoginFailure(page, 'Invalid email or password.');
    await loginPage.login('wrong@example.com', 'wrongpassword');

    await loginPage.expectError(/Invalid email or password/i);
  });

  test('login button is disabled when fields are empty', async ({ page }) => {
    await mockUnauthenticatedApp(page);

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.submitButton).toBeDisabled();
  });

  test('login button enables when both fields are filled', async ({ page }) => {
    await mockUnauthenticatedApp(page);

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.emailInput.fill('test@example.com');
    await loginPage.passwordInput.fill('password123');

    await expect(loginPage.submitButton).toBeEnabled();
  });

  test('shows validation error for invalid email format', async ({ page }) => {
    await mockUnauthenticatedApp(page);

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.emailInput.fill('not-an-email');
    await loginPage.passwordInput.click(); // trigger blur validation

    await expect(page.locator('.login-form')).toContainText('valid email');
  });
});

test.describe('SSO Login', () => {
  test('shows SSO button when SAML is enabled', async ({ page }) => {
    // Override the SAML status to show SSO enabled
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
        body: JSON.stringify({
          enabled: true,
          configured: true,
          passwordLoginAllowed: true,
        }),
      });
    });

    await page.goto('/login');

    const loginPage = new LoginPage(page);
    await expect(loginPage.ssoButton).toBeVisible();
    await expect(loginPage.ssoButton).toContainText('Sign in with SSO');
  });

  test('hides SSO button when SAML is disabled', async ({ page }) => {
    await mockUnauthenticatedApp(page);

    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.ssoButton).not.toBeVisible();
  });
});
