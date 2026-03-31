import { type Page } from '@playwright/test';

/**
 * Mock API responses for E2E tests that run without a live backend.
 * Uses Playwright's route() API to intercept and fulfill requests.
 */

export interface MockUser {
  id: number;
  email: string;
  role: 'administrator' | 'user';
  totpEnabled?: boolean;
  authMethod?: string;
}

const defaultAdmin: MockUser = {
  id: 1,
  email: 'admin@e2e-test.local',
  role: 'administrator',
  totpEnabled: false,
  authMethod: 'local',
};

/**
 * Set up mocks for an app that has already been set up (needsSetup=false)
 * and is NOT authenticated (will show login page).
 */
export async function mockUnauthenticatedApp(page: Page) {
  await page.route('**/api/auth/check-setup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ needsSetup: false }),
    });
  });

  await page.route('**/api/auth/saml/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enabled: false,
        configured: false,
        passwordLoginAllowed: true,
      }),
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 401, body: 'Unauthorized' });
  });

  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({ status: 401, body: 'Unauthorized' });
  });
}

/**
 * Set up mocks for a fresh app that needs initial setup (needsSetup=true).
 */
export async function mockFreshApp(page: Page) {
  await page.route('**/api/auth/check-setup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ needsSetup: true }),
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 401, body: 'Unauthorized' });
  });

  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({ status: 401, body: 'Unauthorized' });
  });
}

/**
 * Set up mocks for an authenticated admin user.
 */
export async function mockAuthenticatedAdmin(page: Page, user: MockUser = defaultAdmin) {
  await page.route('**/api/auth/check-setup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ needsSetup: false }),
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });

  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'mock-token' }),
    });
  });

  await page.route('**/api/auth/saml/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enabled: false,
        configured: false,
        passwordLoginAllowed: true,
      }),
    });
  });
}

/**
 * Mock a successful login response.
 */
export async function mockLoginSuccess(page: Page, user: MockUser = defaultAdmin) {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'mock-access-token',
        user,
      }),
    });
  });

  // After login, /api/auth/me should return the user
  await page.unroute('**/api/auth/me');
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });
}

/**
 * Mock a failed login response.
 */
export async function mockLoginFailure(page: Page, message = 'Invalid credentials') {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message }),
    });
  });
}

/**
 * Mock successful setup (creating initial admin account).
 */
export async function mockSetupSuccess(page: Page, user: MockUser = defaultAdmin) {
  await page.route('**/api/auth/setup', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'mock-access-token',
        user,
      }),
    });
  });
}

/**
 * Mock empty dashboard data so the dashboard page renders without errors.
 */
export async function mockDashboardData(page: Page) {
  await page.route('**/api/dmarc-reports/summary*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalReports: 0,
        totalRecords: 0,
        passRate: 0,
        domains: [],
      }),
    });
  });

  await page.route('**/api/domains', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Catch-all for any other API calls the dashboard might make
  await page.route('**/api/dmarc-reports/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

/**
 * Mock a login response that requires TOTP verification.
 */
export async function mockLoginRequiresTotp(page: Page) {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totpRequired: true,
      }),
    });
  });
}

/**
 * Mock successful TOTP verification.
 */
export async function mockTotpVerifySuccess(page: Page, user: MockUser = defaultAdmin) {
  await page.route('**/api/auth/totp/verify', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'mock-token', user }),
    });
  });

  // After verify, /api/auth/me should return the user
  await page.unroute('**/api/auth/me');
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });
}

/**
 * Mock failed TOTP verification.
 */
export async function mockTotpVerifyFailure(page: Page, message = 'Invalid verification code. Please try again.') {
  await page.route('**/api/auth/totp/verify', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ errorCode: 'INVALID_TOTP_CODE', message }),
    });
  });
}

/**
 * Mock successful recovery code verification.
 */
export async function mockRecoveryCodeSuccess(page: Page, user: MockUser = defaultAdmin) {
  await page.route('**/api/auth/totp/verify-recovery', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'mock-token', user }),
    });
  });

  await page.unroute('**/api/auth/me');
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });
}

/**
 * Mock failed recovery code verification.
 */
export async function mockRecoveryCodeFailure(page: Page, message = 'Invalid recovery code. Please try again.') {
  await page.route('**/api/auth/totp/verify-recovery', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ errorCode: 'INVALID_RECOVERY_CODE', message }),
    });
  });
}

/**
 * Mock successful logout.
 */
export async function mockLogout(page: Page) {
  await page.route('**/api/auth/logout', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

/**
 * Mock explore page API calls.
 */
export async function mockExploreData(page: Page) {
  // Mock distinct values for filters
  await page.route('**/api/dmarc-reports/records/distinct*', async (route) => {
    const url = new URL(route.request().url());
    const field = url.searchParams.get('field');
    const distinctValues: Record<string, string[]> = {
      domain: ['example.com', 'test.org'],
      orgName: ['Google', 'Microsoft'],
      sourceIp: ['192.168.1.1', '10.0.0.1'],
      headerFrom: ['example.com', 'test.org'],
      envelopeFrom: ['bounce.example.com'],
      envelopeTo: ['example.com'],
      dkimDomain: ['example.com'],
      spfDomain: ['example.com'],
      country: ['US', 'DE', 'GB'],
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(distinctValues[field || ''] || []),
    });
  });

  // Mock search records
  await page.route('**/api/dmarc-reports/records/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'rec-1',
            sourceIp: '192.168.1.1',
            count: 42,
            disposition: 'none',
            headerFrom: 'example.com',
            envelopeTo: 'example.com',
            geoCountry: 'US',
            geoIsp: 'Google LLC',
            geoOrg: 'Google',
            isForwarded: false,
            dmarcDkim: 'pass',
            dmarcSpf: 'pass',
            dkimResults: [{ domain: 'example.com', result: 'pass', selector: 's1' }],
            spfResults: [{ domain: 'example.com', result: 'pass', scope: 'mfrom' }],
            report: { id: 'rpt-1', orgName: 'Google', beginDate: '2026-03-01T00:00:00Z', domain: 'example.com' },
          },
          {
            id: 'rec-2',
            sourceIp: '10.0.0.1',
            count: 15,
            disposition: 'quarantine',
            headerFrom: 'test.org',
            envelopeTo: 'test.org',
            geoCountry: 'DE',
            geoIsp: 'Deutsche Telekom',
            geoOrg: 'DT',
            isForwarded: true,
            dmarcDkim: 'fail',
            dmarcSpf: 'fail',
            dkimResults: [{ domain: 'test.org', result: 'fail', selector: 's1' }],
            spfResults: [{ domain: 'test.org', result: 'fail', scope: 'mfrom' }],
            report: { id: 'rpt-2', orgName: 'Microsoft', beginDate: '2026-03-02T00:00:00Z', domain: 'test.org' },
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
      }),
    });
  });

  // Mock domain list for explore
  await page.route('**/api/domains', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: '1', domain: 'example.com' },
        { id: '2', domain: 'test.org' },
      ]),
    });
  });
}

/**
 * Mock reports page API calls.
 */
export async function mockReportsData(page: Page) {
  await page.route('**/api/dmarc-reports/report-domains', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ domains: ['example.com', 'test.org'] }),
    });
  });

  await page.route('**/api/dmarc-reports/list*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'rpt-1',
            reportId: '16741234567890',
            orgName: 'google.com',
            domain: 'example.com',
            beginDate: '2026-03-01T00:00:00Z',
            endDate: '2026-03-02T00:00:00Z',
            createdAt: '2026-03-02T12:00:00Z',
            updatedAt: '2026-03-02T12:00:00Z',
            records: [],
          },
          {
            id: 'rpt-2',
            reportId: '16741234567891',
            orgName: 'outlook.com',
            domain: 'test.org',
            beginDate: '2026-03-01T00:00:00Z',
            endDate: '2026-03-02T00:00:00Z',
            createdAt: '2026-03-02T12:00:00Z',
            updatedAt: '2026-03-02T12:00:00Z',
            records: [],
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
      }),
    });
  });
}

/**
 * Mock domains page API calls.
 */
export async function mockDomainsData(page: Page) {
  await page.route('**/api/domains/statistics*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: '1',
          domain: 'example.com',
          isManaged: true,
          totalMessages: 500,
          passedMessages: 475,
          failedMessages: 25,
          dmarcPassRate: 95.0,
          dkimPassRate: 96.0,
          spfPassRate: 94.0,
          uniqueSources: 12,
        },
        {
          id: null,
          domain: 'unknown-sender.com',
          isManaged: false,
          totalMessages: 50,
          passedMessages: 10,
          failedMessages: 40,
          dmarcPassRate: 20.0,
          dkimPassRate: 30.0,
          spfPassRate: 24.0,
          uniqueSources: 5,
        },
      ]),
    });
  });

  await page.route('**/api/domains', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: '1', domain: 'example.com', description: 'Main domain' }]),
      });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: '2', domain: body.domain, description: body.description || '' }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });
}

/**
 * Mock user management page API calls.
 */
export async function mockUserManagementData(page: Page) {
  await page.route('**/api/auth/users', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, email: 'admin@e2e-test.local', role: 'administrator', authProvider: 'local', createdAt: '2026-01-01T00:00:00Z' },
        { id: 2, email: 'user@e2e-test.local', role: 'user', authProvider: 'local', createdAt: '2026-02-01T00:00:00Z' },
      ]),
    });
  });

  await page.route('**/api/auth/invites', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'inv-1',
          email: 'pending@e2e-test.local',
          role: 'user',
          expiresAt: '2026-04-15T00:00:00Z',
          createdAt: '2026-03-15T00:00:00Z',
        },
      ]),
    });
  });

  await page.route('**/api/auth/saml/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enabled: false,
        configured: false,
        passwordLoginAllowed: true,
      }),
    });
  });
}

/**
 * Mock profile page API calls.
 */
export async function mockProfileData(page: Page) {
  await page.route('**/api/auth/totp/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: false, lastUsed: null }),
    });
  });
}

/**
 * Mock profile page with TOTP enabled.
 */
export async function mockProfileDataWithTotp(page: Page) {
  await page.route('**/api/auth/totp/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: true, lastUsed: '2026-03-28T10:00:00Z' }),
    });
  });
}

/**
 * Mock settings page API calls.
 */
export async function mockSettingsData(page: Page) {
  await page.route('**/api/settings/third-party-senders', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'tps-1',
            name: 'SendGrid',
            description: 'Transactional emails',
            dkimPattern: 'sendgrid.net',
            spfPattern: 'sendgrid.net',
            enabled: true,
          },
        ]),
      });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'tps-2', ...body }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });

  await page.route('**/api/reprocessing/current', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'null',
    });
  });

  await page.route('**/api/reprocessing/jobs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

/**
 * Mock dashboard data with rich content for deep tests.
 */
export async function mockDashboardDataRich(page: Page) {
  // Catch-all MUST be registered first so specific routes (registered after) take priority (Playwright LIFO)
  await page.route('**/api/dmarc-reports/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/domains', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: '1', domain: 'example.com' },
        { id: '2', domain: 'test.org' },
      ]),
    });
  });

  await page.route('**/api/dmarc-reports/stats/auth-summary*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total: 1000,
        dkimPass: 920,
        spfPass: 880,
        dmarcPass: 945,
        enforcement: 950,
      }),
    });
  });

  await page.route('**/api/dmarc-reports/stats/auth-breakdown*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        dkim: { pass: 920, fail: 50, missing: 30 },
        spf: { pass: 880, fail: 80, missing: 40 },
      }),
    });
  });

  await page.route('**/api/dmarc-reports/stats/auth-pass-rate-timeseries*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { date: '2026-03-01', dkimPassRate: 92, spfPassRate: 88, totalCount: 100, dkimPassCount: 92, spfPassCount: 88 },
        { date: '2026-03-02', dkimPassRate: 94, spfPassRate: 90, totalCount: 120, dkimPassCount: 113, spfPassCount: 108 },
      ]),
    });
  });

  await page.route('**/api/dmarc-reports/stats/disposition-timeseries*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { date: '2026-03-01', none: 80, quarantine: 15, reject: 5, total: 100 },
        { date: '2026-03-02', none: 100, quarantine: 12, reject: 8, total: 120 },
      ]),
    });
  });

  await page.route('**/api/dmarc-reports/stats/timeseries*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { date: '2026-03-01', count: 100 },
        { date: '2026-03-02', count: 120 },
      ]),
    });
  });

  await page.route('**/api/dmarc-reports/top-countries*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { country: 'US', count: 500, dmarcPassCount: 475, dkimPassCount: 480, spfPassCount: 470 },
        { country: 'DE', count: 200, dmarcPassCount: 180, dkimPassCount: 190, spfPassCount: 185 },
        { country: 'GB', count: 100, dmarcPassCount: 95, dkimPassCount: 98, spfPassCount: 92 },
      ]),
    });
  });

  await page.route('**/api/dmarc-reports/top-header-from*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { headerFrom: 'example.com', count: 600, dmarcPassCount: 570, dkimPassCount: 580, spfPassCount: 560 },
          { headerFrom: 'test.org', count: 200, dmarcPassCount: 180, dkimPassCount: 185, spfPassCount: 175 },
        ],
        total: 2,
        page: 1,
        pageSize: 10,
      }),
    });
  });

  await page.route('**/api/dmarc-reports/geo-heatmap*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/dmarc-reports/top-ips-enhanced*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { sourceIp: '192.168.1.1', count: 300, passCount: 285, failCount: 15, dkimPassCount: 290, spfPassCount: 280, country: 'US' },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      }),
    });
  });
}

/**
 * Mock invite accept page: valid invite token.
 */
export async function mockInviteValid(page: Page, token = 'valid-token') {
  await page.route(`**/api/auth/invite/${token}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        valid: true,
        email: 'newuser@e2e-test.local',
        role: 'user',
      }),
    });
  });
}

/**
 * Mock invite accept page: expired/invalid token.
 */
export async function mockInviteInvalid(page: Page, token = 'expired-token') {
  await page.route(`**/api/auth/invite/${token}`, async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'This invitation is invalid or has expired' }),
    });
  });
}

/**
 * Mock successful invite acceptance.
 */
export async function mockInviteAcceptSuccess(page: Page, token = 'valid-token') {
  await page.route(`**/api/auth/invite/${token}/accept`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'mock-token',
        user: { id: 3, email: 'newuser@e2e-test.local', role: 'user' },
      }),
    });
  });
}

/**
 * Mock successful password change.
 */
export async function mockPasswordChangeSuccess(page: Page) {
  await page.route('**/api/auth/change-password', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Password changed successfully' }),
    });
  });
}

/**
 * Mock failed password change (wrong current password).
 */
export async function mockPasswordChangeFailure(page: Page, message = 'Current password is incorrect') {
  await page.route('**/api/auth/change-password', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message }),
    });
  });
}

/**
 * Mock TOTP setup response (QR code + secret).
 */
export async function mockTotpSetup(page: Page) {
  await page.route('**/api/auth/totp/setup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      }),
    });
  });
}

/**
 * Mock TOTP enable (verification step).
 */
export async function mockTotpEnable(page: Page) {
  await page.route('**/api/auth/totp/enable', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recoveryCodes: ['ABCD-1234-EFGH', 'IJKL-5678-MNOP', 'QRST-9012-UVWX', 'YZAB-3456-CDEF', 'GHIJ-7890-KLMN', 'OPQR-1234-STUV', 'WXYZ-5678-ABCD', 'EFGH-9012-IJKL'],
      }),
    });
  });
}

/**
 * Mock TOTP disable success.
 */
export async function mockTotpDisable(page: Page) {
  await page.route('**/api/auth/totp/disable', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Two-factor authentication disabled' }),
    });
  });
}

/**
 * Mock user invite creation success.
 */
export async function mockCreateInviteSuccess(page: Page) {
  await page.route('**/api/auth/users/invite', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'inv-new',
        email: body.email,
        role: body.role,
        inviteLink: 'http://localhost:4200/invite/new-token-123',
        emailStatus: 'not_configured',
        expiresAt: '2026-04-30T00:00:00Z',
        createdAt: '2026-03-31T00:00:00Z',
      }),
    });
  });
}

/**
 * Mock SMTP config status (not configured).
 */
export async function mockSmtpConfig(page: Page, configured = false) {
  await page.route('**/api/smtp/config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });
}

/**
 * Mock report XML content for the XML viewer dialog.
 */
export async function mockReportXml(page: Page) {
  await page.route('**/api/dmarc-reports/report/*/xml', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain',
      body: `<?xml version="1.0" encoding="UTF-8"?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>16741234567890</report_id>
  </report_metadata>
  <policy_published>
    <domain>example.com</domain>
    <adkim>r</adkim>
    <aspf>r</aspf>
    <p>none</p>
  </policy_published>
</feedback>`,
    });
  });

  await page.route('**/api/dmarc-reports/report/*', async (route) => {
    if (route.request().url().includes('/xml')) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'rpt-1',
        reportId: '16741234567890',
        orgName: 'google.com',
        domain: 'example.com',
        beginDate: '2026-03-01T00:00:00Z',
        endDate: '2026-03-02T00:00:00Z',
        records: [],
      }),
    });
  });
}

/**
 * Mock upload endpoint with failure response.
 */
export async function mockUploadFailure(page: Page, message = 'Invalid file format') {
  await page.route('**/api/dmarc-reports/upload', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message }),
    });
  });
}

/**
 * Mock reprocessing job in progress.
 */
export async function mockReprocessingInProgress(page: Page) {
  await page.route('**/api/reprocessing/current', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'job-1',
        status: 'running',
        totalRecords: 1000,
        processedRecords: 450,
        forwardedCount: 50,
        notForwardedCount: 380,
        unknownCount: 20,
        startedAt: '2026-03-31T10:00:00Z',
        completedAt: null,
        dateFrom: null,
        dateTo: null,
      }),
    });
  });

  await page.route('**/api/reprocessing/jobs/job-*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'job-1',
        status: 'running',
        totalRecords: 1000,
        processedRecords: 450,
        forwardedCount: 50,
        notForwardedCount: 380,
        unknownCount: 20,
        startedAt: '2026-03-31T10:00:00Z',
        completedAt: null,
        dateFrom: null,
        dateTo: null,
      }),
    });
  });

  await page.route('**/api/reprocessing/jobs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'job-prev',
          status: 'completed',
          totalRecords: 500,
          processedRecords: 500,
          forwardedCount: 30,
          notForwardedCount: 450,
          unknownCount: 20,
          startedAt: '2026-03-20T10:00:00Z',
          completedAt: '2026-03-20T10:05:00Z',
          dateFrom: null,
          dateTo: null,
        },
      ]),
    });
  });
}

/**
 * Mock explore data with filtered results (fewer records).
 */
export async function mockExploreFilteredData(page: Page) {
  await page.unroute('**/api/dmarc-reports/records/search*');
  await page.route('**/api/dmarc-reports/records/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'rec-1',
            sourceIp: '192.168.1.1',
            count: 42,
            disposition: 'none',
            headerFrom: 'example.com',
            envelopeTo: 'example.com',
            geoCountry: 'US',
            geoIsp: 'Google LLC',
            geoOrg: 'Google',
            isForwarded: false,
            dmarcDkim: 'pass',
            dmarcSpf: 'pass',
            dkimResults: [{ domain: 'example.com', result: 'pass', selector: 's1' }],
            spfResults: [{ domain: 'example.com', result: 'pass', scope: 'mfrom' }],
            report: { id: 'rpt-1', orgName: 'Google', beginDate: '2026-03-01T00:00:00Z', domain: 'example.com' },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    });
  });
}

/**
 * Mock domain creation success.
 */
export async function mockDomainCreateSuccess(page: Page) {
  await page.route('**/api/domains', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: '3', domain: body.domain, description: body.notes || '' }),
      });
    } else {
      return route.fallback();
    }
  });
}

/**
 * Mock authenticated non-admin user.
 */
export async function mockAuthenticatedUser(page: Page) {
  const user: MockUser = { id: 2, email: 'user@e2e-test.local', role: 'user', totpEnabled: false, authMethod: 'local' };
  await mockAuthenticatedAdmin(page, user);
}
