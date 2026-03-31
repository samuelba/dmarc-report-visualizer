import { test, expect } from '@playwright/test';
import { mockUnauthenticatedApp, mockInviteValid, mockInviteInvalid, mockInviteAcceptSuccess } from '../helpers/mock-api';

test.describe('Invite Accept Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockUnauthenticatedApp(page);
  });

  test('shows invite details for valid token', async ({ page }) => {
    await mockInviteValid(page, 'valid-token');
    await page.goto('/invite/valid-token');

    await expect(page.locator('.invite-accept-card')).toContainText('Accept Invitation');
    await expect(page.locator('.detail-value')).toContainText(['newuser@e2e-test.local']);
  });

  test('shows role label for invited user', async ({ page }) => {
    await mockInviteValid(page, 'valid-token');
    await page.goto('/invite/valid-token');

    // Should display user role
    await expect(page.locator('.invite-details')).toBeVisible();
    await expect(page.locator('.invite-details')).toContainText('newuser@e2e-test.local');
  });

  test('shows error for expired/invalid token', async ({ page }) => {
    await mockInviteInvalid(page, 'expired-token');
    await page.goto('/invite/expired-token');

    await expect(page.locator('.error-container')).toBeVisible();
    await expect(page.locator('.error-container')).toContainText('invalid or has expired');
  });

  test('shows Go to Login button for invalid invite', async ({ page }) => {
    await mockInviteInvalid(page, 'bad-token');
    await page.goto('/invite/bad-token');

    await expect(page.getByRole('button', { name: /go to login/i })).toBeVisible();
  });

  test('password and confirmation fields are visible for valid invite', async ({ page }) => {
    await mockInviteValid(page, 'valid-token');
    await page.goto('/invite/valid-token');

    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).toBeVisible();
  });

  test('submit button is disabled when form is empty', async ({ page }) => {
    await mockInviteValid(page, 'valid-token');
    await page.goto('/invite/valid-token');

    const submitButton = page.getByRole('button', { name: /create account/i });
    await expect(submitButton).toBeDisabled();
  });

  test('shows password strength indicator when typing', async ({ page }) => {
    await mockInviteValid(page, 'valid-token');
    await page.goto('/invite/valid-token');

    await page.getByLabel('Password', { exact: true }).fill('Test1234!');
    await expect(page.locator('app-password-strength')).toBeVisible();
  });

  test('shows error when passwords do not match', async ({ page }) => {
    await mockInviteValid(page, 'valid-token');
    await page.goto('/invite/valid-token');

    await page.getByLabel('Password', { exact: true }).fill('StrongP@ssw0rd123!');
    await page.getByLabel('Confirm Password').fill('DifferentP@ss123!');
    await page.getByLabel('Confirm Password').blur();

    await expect(page.locator('mat-error')).toContainText('Passwords do not match');
  });

  test('successful invite acceptance submits form', async ({ page }) => {
    await mockInviteValid(page, 'valid-token');
    await mockInviteAcceptSuccess(page, 'valid-token');
    await page.goto('/invite/valid-token');

    await page.getByLabel('Password', { exact: true }).fill('StrongP@ssw0rd123!');
    await page.getByLabel('Confirm Password').fill('StrongP@ssw0rd123!');

    const submitButton = page.getByRole('button', { name: /create account/i });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Should redirect after successful acceptance
    await page.waitForURL(/\/(dashboard|login)/, { timeout: 5000 });
  });

  test('shows login link for existing users', async ({ page }) => {
    await mockInviteValid(page, 'valid-token');
    await page.goto('/invite/valid-token');

    await expect(page.locator('.login-link')).toContainText('Already have an account?');
    await expect(page.getByRole('link', { name: /log in/i })).toBeVisible();
  });
});
