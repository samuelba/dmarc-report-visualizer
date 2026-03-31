import { type Page, type Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly ssoButton: Locator;
  readonly card: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByTestId('login-email');
    this.passwordInput = page.getByTestId('login-password');
    this.submitButton = page.getByTestId('login-submit');
    this.errorMessage = page.getByTestId('login-error');
    this.ssoButton = page.getByTestId('login-sso-button');
    this.card = page.locator('.login-card');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string | RegExp) {
    await expect(this.errorMessage).toContainText(message);
  }

  async expectRedirectToDashboard() {
    await expect(this.page).toHaveURL(/dashboard/);
  }
}
