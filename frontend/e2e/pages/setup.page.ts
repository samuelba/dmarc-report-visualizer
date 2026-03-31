import { type Page, type Locator, expect } from '@playwright/test';

export class SetupPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly card: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByTestId('setup-email');
    this.passwordInput = page.getByTestId('setup-password');
    this.confirmPasswordInput = page.getByTestId('setup-confirm-password');
    this.submitButton = page.getByTestId('setup-submit');
    this.card = page.locator('.setup-card');
  }

  async goto() {
    await this.page.goto('/setup');
  }

  async fillForm(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.confirmPasswordInput.fill(password);
  }
}
