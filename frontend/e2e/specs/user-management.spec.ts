import { test, expect } from '@playwright/test';
import { mockAuthenticatedAdmin, mockUserManagementData } from '../helpers/mock-api';

test.describe('User Management Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockUserManagementData(page);
  });

  test('user management page loads and shows users table', async ({ page }) => {
    await page.goto('/users');

    await expect(page).toHaveURL(/\/users/);
    await expect(page.getByTestId('user-management-container')).toBeVisible();
    await expect(page.locator('.users-card mat-card-title')).toContainText('Users');
  });

  test('displays user list with correct data', async ({ page }) => {
    await page.goto('/users');

    await expect(page.locator('.users-card table')).toContainText('admin@e2e-test.local');
    await expect(page.locator('.users-card table')).toContainText('user@e2e-test.local');
  });

  test('displays user roles', async ({ page }) => {
    await page.goto('/users');

    await expect(page.locator('.users-card table')).toContainText('Administrator');
    await expect(page.locator('.users-card table')).toContainText('User');
  });

  test('invite user button is visible', async ({ page }) => {
    await page.goto('/users');

    await expect(page.getByTestId('invite-user-button')).toBeVisible();
    await expect(page.getByTestId('invite-user-button')).toContainText('Invite User');
  });

  test('pending invitations section shows invites', async ({ page }) => {
    await page.goto('/users');

    await expect(page.locator('.invites-card mat-card-title')).toContainText('Pending Invitations');
    await expect(page.locator('.invites-card table')).toContainText('pending@e2e-test.local');
  });

  test('invite user button opens dialog', async ({ page }) => {
    await page.goto('/users');

    await page.getByTestId('invite-user-button').click();

    await expect(page.locator('mat-dialog-container')).toBeVisible({ timeout: 3000 });
  });

  test('users table has correct column headers', async ({ page }) => {
    await page.goto('/users');

    await expect(page.locator('.users-card table')).toContainText('Email');
    await expect(page.locator('.users-card table')).toContainText('Role');
    await expect(page.locator('.users-card table')).toContainText('Auth Provider');
    await expect(page.locator('.users-card table')).toContainText('Created');
    await expect(page.locator('.users-card table')).toContainText('Actions');
  });

  test('non-admin is redirected away from user management', async ({ page }) => {
    // Re-mock as regular user
    await page.unroute('**/api/auth/me');
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 2,
          email: 'user@e2e-test.local',
          role: 'user',
        }),
      });
    });

    // Mock dashboard data for redirect target
    await page.route('**/api/dmarc-reports/summary*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ totalReports: 0, totalRecords: 0, passRate: 0, domains: [] }),
      });
    });
    await page.route('**/api/dmarc-reports/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('/users');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
