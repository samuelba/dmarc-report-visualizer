import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Configure web server to start before tests.
   * In 'mock' mode (default), serves the built frontend statically.
   * Set E2E_MODE=live to use the dev servers with a real backend. */
  webServer:
    process.env.E2E_MODE === 'live'
      ? [
          {
            command: 'cd ../backend && npm run start:dev',
            url: 'http://localhost:3000/api/health',
            reuseExistingServer: true,
            timeout: 30_000,
          },
          {
            command: 'npx ng serve --configuration=development',
            url: 'http://localhost:4200',
            reuseExistingServer: true,
            timeout: 30_000,
          },
        ]
      : {
          command: 'npx serve -s dist/dmarc-frontend/browser -l 4200 --no-clipboard',
          url: 'http://localhost:4200',
          reuseExistingServer: true,
          timeout: 15_000,
        },
});
