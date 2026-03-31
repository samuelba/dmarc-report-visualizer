import { type Page, type Locator, expect } from '@playwright/test';

export class UploadPage {
  readonly page: Page;
  readonly dropzone: Locator;
  readonly fileInput: Locator;
  readonly submitButton: Locator;
  readonly progress: Locator;
  readonly results: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dropzone = page.getByTestId('upload-dropzone');
    this.fileInput = page.getByTestId('upload-file-input');
    this.submitButton = page.getByTestId('upload-submit');
    this.progress = page.getByTestId('upload-progress');
    this.results = page.getByTestId('upload-results');
  }

  async goto() {
    await this.page.goto('/upload');
  }
}
