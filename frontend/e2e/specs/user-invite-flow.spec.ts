import { test, expect } from '@playwright/test';
import {
  mockAuthenticatedAdmin,
  mockDashboardData,
  mockUserManagementData,
  mockCreateInviteSuccess,
  mockSmtpConfig,
} from '../helpers/mock-api';

test.describe('User Management - Invite Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedAdmin(page);
    await mockDashboardData(page);
    await mockUserManagementData(page);
    await mockSmtpConfig(page, false);
  });

  test('invite user dialog opens with form', async ({ page }) => {
    await page.goto('/users');
    await page.getByTestId('invite-user-button').click();

    await expect(page.locator('mat-dialog-container')).toBeVisible();
    await expect(page.locator('mat-dialog-container')).toContainText('Invite User');
  });

  test('invite dialog has email and role fields', async ({ page }) => {
    await page.goto('/users');
    await page.getByTestId('invite-user-button').click();

    await expect(page.locator('mat-dialog-container').getByLabel('Email Address')).toBeVisible();
    await expect(page.locator('mat-dialog-container').getByLabel('Role')).toBeVisible();
  });

  test('invite dialog shows generate link info when SMTP not configured', async ({ page }) => {
    await page.goto('/users');
    await page.getByTestId('invite-user-button').click();

    await expect(page.locator('mat-dialog-container')).toContainText('Generate an invite link');
  });

  test('invite submit is disabled with empty email', async ({ page }) => {
    await page.goto('/users');
    await page.getByTestId('invite-user-button').click();

    const submitButton = page.locator('mat-dialog-container').getByRole('button', { name: /generate invite/i });
    await expect(submitButton).toBeDisabled();
  });

  test('invite submit enables with valid email', async ({ page }) => {
    await page.goto('/users');
    await page.getByTestId('invite-user-button').click();

    await page.locator('mat-dialog-container').getByLabel('Email Address').fill('newuser@example.com');

    const submitButton = page.locator('mat-dialog-container').getByRole('button', { name: /generate invite/i });
    await expect(submitButton).toBeEnabled();
  });

  test('invite shows email validation error for invalid email', async ({ page }) => {
    await page.goto('/users');
    await page.getByTestId('invite-user-button').click();

    await page.locator('mat-dialog-container').getByLabel('Email Address').fill('not-an-email');
    await page.locator('mat-dialog-container').getByLabel('Email Address').blur();

    await expect(page.locator('mat-dialog-container mat-error')).toContainText('valid email');
  });

  test('successful invite shows generated link', async ({ page }) => {
    await mockCreateInviteSuccess(page);
    await page.goto('/users');
    await page.getByTestId('invite-user-button').click();

    await page.locator('mat-dialog-container').getByLabel('Email Address').fill('newuser@example.com');
    await page.locator('mat-dialog-container').getByRole('button', { name: /generate invite/i }).click();

    // Should show the invite result with link
    await expect(page.locator('.invite-result')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.invite-result')).toContainText('newuser@example.com');
  });

  test('generated invite shows copy link button', async ({ page }) => {
    await mockCreateInviteSuccess(page);
    await page.goto('/users');
    await page.getByTestId('invite-user-button').click();

    await page.locator('mat-dialog-container').getByLabel('Email Address').fill('newuser@example.com');
    await page.locator('mat-dialog-container').getByRole('button', { name: /generate invite/i }).click();

    await expect(page.locator('.invite-result')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('mat-dialog-container').locator('button[mattooltip="Copy to clipboard"]')).toBeVisible();
  });

  test('generated invite shows expiration date', async ({ page }) => {
    await mockCreateInviteSuccess(page);
    await page.goto('/users');
    await page.getByTestId('invite-user-button').click();

    await page.locator('mat-dialog-container').getByLabel('Email Address').fill('newuser@example.com');
    await page.locator('mat-dialog-container').getByRole('button', { name: /generate invite/i }).click();

    await expect(page.locator('.invite-result')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.invite-details')).toContainText('Expires');
  });

  test('done button closes dialog after invite creation', async ({ page }) => {
    await mockCreateInviteSuccess(page);
    await page.goto('/users');
    await page.getByTestId('invite-user-button').click();

    await page.locator('mat-dialog-container').getByLabel('Email Address').fill('newuser@example.com');
    await page.locator('mat-dialog-container').getByRole('button', { name: /generate invite/i }).click();

    await expect(page.locator('.invite-result')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /done/i }).click();

    await expect(page.locator('mat-dialog-container')).not.toBeVisible();
  });

  test('pending invitations section shows invite email and expiry', async ({ page }) => {
    await page.goto('/users');

    await expect(page.getByTestId('user-management-container')).toContainText('pending@e2e-test.local');
  });
});
