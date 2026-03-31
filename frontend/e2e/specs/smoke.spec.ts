import { test, expect } from '@playwright/test';
import { mockUnauthenticatedApp, mockFreshApp } from '../helpers/mock-api';

test.describe('Smoke Tests', () => {
  test('app redirects unauthenticated user to /login', async ({ page }) => {
    await mockUnauthenticatedApp(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page renders with email and password fields', async ({ page }) => {
    await mockUnauthenticatedApp(page);
    await page.goto('/login');

    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-password')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });

  test('login page shows title and subtitle', async ({ page }) => {
    await mockUnauthenticatedApp(page);
    await page.goto('/login');

    await expect(page.locator('.login-card')).toContainText('Login');
    await expect(page.locator('.login-card')).toContainText('Sign in to your account');
  });

  test('/setup redirects to /login when setup is already complete', async ({ page }) => {
    await mockUnauthenticatedApp(page);
    await page.goto('/setup');
    await expect(page).toHaveURL(/\/login/);
  });

  test('/setup is accessible when app needs setup', async ({ page }) => {
    await mockFreshApp(page);
    await page.goto('/setup');

    await expect(page.getByTestId('setup-email')).toBeVisible();
    await expect(page.getByTestId('setup-password')).toBeVisible();
    await expect(page.getByTestId('setup-confirm-password')).toBeVisible();
    await expect(page.getByTestId('setup-submit')).toBeVisible();
  });
});
