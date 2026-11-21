import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import type { PasswordService } from '../src/modules/auth/services/password.service';
import type { SamlService } from '../src/modules/auth/services/saml.service';
import {
  cookiesOf,
  createApp,
  loadBuilt,
  login,
  setupAdmin,
} from './mcp-helpers';

function cookieValue(cookies: string[], name: string): string | undefined {
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

describe('SAML Test Mode (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let samlService: SamlService;
  let passwordService: PasswordService;
  let adminCookies: string[];

  // Sample IdP metadata XML for testing
  const sampleIdpMetadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>MIIDXTCCAkWgAwIBAgIJALmVVuDWu4NYMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwHhcNMTYxMjMxMTQzNDQ3WhcNNDgwNjI1MTQzNDQ3WjBFMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzUCFozgNb1h1M0jzNRSCjhOBnR+uVbVpaWfXYIR+AhWDdEe5ryY+CgavOg8bfLybyzFdehlYdDRgkedEB/GjG8aJw06l0qF4jDOAw0kEygWCu2mcH7XOxRt+YAH3TVHa/Hu1W3WjzkobqqqLQ8gkKWWM27fOgAZ6GieaJBN6VBSMMcPey3HWLBmc+TYJmv1dbaO2jHhKh8pfKw0W12VM8P1PIO8gv4Phu/uuJYieBWKixBEyy0lHjyixYFCR12xdh4CA47q958ZRGnnDUGFVE1QhgRacJCOZ9bd5t9mr8KLaVBYTCJo5ERE8jymab5dPqe5qKfJsCZiqWglbjUo9twIDAQABo1AwTjAdBgNVHQ4EFgQUxpuwcs/CYQOyui+r1G+3KxBNhxkwHwYDVR0jBBgwFoAUxpuwcs/CYQOyui+r1G+3KxBNhxkwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAAiWUKs/2x/viNCKi3Y6blEuCtAGhzOOZ9EjrvJ8+COH3Rag3tVBWrcBZ3/uhhPq5gy9lqw4OkvEws99/5jFsX1FJ6MKBgqfuy7yh5s1YfM0ANHYczMmYpZeAcQf2CGAaVfwTTfSlzNLsF2lW/ly7yapFzlYSJLGoVE+OHEu8g09ybs+0tpnaRXiieR4lpQEDXLY2B/FnpcaoBMsLoqKT6+rSlDr5C3jTU11UckOGbfJ1qVtpaqzZWgvMlMIFSqYuQRwdJo+4xdaGEqxNMCKvP7SbCDLCYT0+KPCxnJRnKpruCN0s8Bk0O5vYfqBaJp/VgkqSaXnAhCnXhCYQJHlpKw==</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;

  beforeAll(async () => {
    app = await createApp(false);
    dataSource = app.get(DataSource);
    const { SamlService } = loadBuilt<
      typeof import('../src/modules/auth/services/saml.service')
    >('modules/auth/services/saml.service');
    samlService = app.get(SamlService);
    const { PasswordService } = loadBuilt<
      typeof import('../src/modules/auth/services/password.service')
    >('modules/auth/services/password.service');
    passwordService = app.get(PasswordService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM saml_configs');
    await dataSource.query('DELETE FROM refresh_tokens');
    await dataSource.query('DELETE FROM users');
    samlService['invalidateConfigCache']();

    adminCookies = await setupAdmin(app);
  });

  describe('POST /auth/saml/test/initiate', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .expect(401);
    });

    it('should require admin role', async () => {
      await dataSource.query(
        `INSERT INTO users (email, password_hash, role, auth_provider)
         VALUES ($1, $2, 'user', 'local')`,
        [
          'viewer@example.com',
          await passwordService.hashPassword('ViewerPass123!'),
        ],
      );
      const userCookies = await login(
        app,
        'viewer@example.com',
        'ViewerPass123!',
      );

      await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', userCookies)
        .expect(403);
    });

    it('should return error when SAML is not configured', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not configured');
    });

    it('should return error when SAML configuration is incomplete', async () => {
      // Create incomplete configuration (missing IdP details)
      await dataSource.query(`
        INSERT INTO saml_configs (
          id, enabled, sp_entity_id, sp_acs_url, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), false, 'dmarc-app',
          'http://localhost:3000/auth/saml/callback', NOW(), NOW()
        )
      `);

      const response = await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('incomplete');
    });

    it('should return test URL when SAML is configured', async () => {
      // Create complete SAML configuration
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Cookie', adminCookies)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('valid');
      expect(response.body.testLoginUrl).toBeDefined();
      expect(response.body.testLoginUrl).toBe('/api/auth/saml/test/login');
    });

    it('should allow testing even when SAML is disabled', async () => {
      // Create configuration but keep it disabled
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Cookie', adminCookies)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      // Verify SAML is disabled
      const configResponse = await request(app.getHttpServer())
        .get('/auth/saml/config')
        .set('Cookie', adminCookies)
        .expect(200);
      expect(configResponse.body.enabled).toBe(false);

      // Test should still work
      const response = await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.testLoginUrl).toBeDefined();
    });
  });

  describe('GET /auth/saml/test/login', () => {
    beforeEach(async () => {
      // Configure SAML for test login tests
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Cookie', adminCookies)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);
    });

    it('should require admin role', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/saml/test/login')
        .expect(401);

      expect(response.body.message).toBeDefined();
    });

    it('should redirect to IdP when admin accesses endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/saml/test/login')
        .set('Cookie', adminCookies)
        .expect(302);

      // Should redirect to IdP SSO URL
      expect(response.headers.location).toContain(
        'https://idp.example.com/sso',
      );
      expect(response.headers.location).toContain('SAMLRequest');
    });

    it('should work even when SAML is disabled for regular users', async () => {
      // Verify SAML is disabled
      const configResponse = await request(app.getHttpServer())
        .get('/auth/saml/config')
        .set('Cookie', adminCookies)
        .expect(200);
      expect(configResponse.body.enabled).toBe(false);

      // Regular SAML login should fail
      await request(app.getHttpServer()).get('/auth/saml/login').expect(403);

      // But test login should work
      const response = await request(app.getHttpServer())
        .get('/auth/saml/test/login')
        .set('Cookie', adminCookies)
        .expect(302);

      expect(response.headers.location).toContain(
        'https://idp.example.com/sso',
      );
    });
  });

  describe('POST /auth/saml/callback with test mode', () => {
    beforeEach(async () => {
      // Configure SAML for callback tests
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Cookie', adminCookies)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);
    });

    it('should reject callback without SAML response', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/callback')
        .expect(401);

      expect(response.body.message).toContain('SAML');
    });

    it('should reject callback with invalid SAML response', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/callback')
        .send({ SAMLResponse: 'invalid-base64-data' })
        .expect(401);

      expect(response.body.message).toContain('SAML');
    });

    // Note: Testing with valid SAML assertions requires generating properly signed
    // SAML responses, which is complex. Test mode is indicated by RelayState=testMode=true
    // which is set by the saml-test strategy. When present, the callback shows a success
    // page instead of creating a session.
    // Full SAML assertion testing would be done with mock IdP libraries or manually.
  });

  describe('Session Isolation', () => {
    it('should not affect admin session when test mode is used', async () => {
      // Configure SAML
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Cookie', adminCookies)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      const testResponse = await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(testResponse.body.success).toBe(true);
      expect(cookiesOf(testResponse)).toEqual([]);

      await request(app.getHttpServer())
        .get('/auth/saml/config')
        .set('Cookie', adminCookies)
        .expect(200);

      const refreshResponse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', adminCookies)
        .expect(200);

      const newAccessToken = cookieValue(
        cookiesOf(refreshResponse),
        'accessToken',
      );
      expect(newAccessToken).toBeDefined();
      expect(newAccessToken).not.toBe(cookieValue(adminCookies, 'accessToken'));
    });
  });

  describe('Fresh Config Loading', () => {
    it('should load fresh config from database for test mode', async () => {
      // Create initial SAML configuration
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Cookie', adminCookies)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      // Initiate test with initial config
      const test1Response = await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(test1Response.body.success).toBe(true);

      // Update SAML configuration
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Cookie', adminCookies)
        .send({
          idpEntityId: 'https://updated-idp.example.com',
          idpSsoUrl: 'https://updated-idp.example.com/sso',
          idpCertificate:
            'MIIDXTCCAkWgAwIBAgIJALmVVuDWu4NYMA0GCSqGSIb3DQEBCwUA',
        })
        .expect(200);

      // Verify config was updated
      const configResponse = await request(app.getHttpServer())
        .get('/auth/saml/config')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(configResponse.body.idpEntityId).toBe(
        'https://updated-idp.example.com',
      );

      // Test should use fresh config (would redirect to updated IdP)
      const test2Response = await request(app.getHttpServer())
        .get('/auth/saml/test/login')
        .set('Cookie', adminCookies)
        .expect(302);

      // Should redirect to updated IdP SSO URL
      expect(test2Response.headers.location).toContain(
        'https://updated-idp.example.com/sso',
      );
    });

    it('should bypass cache and always load from database', async () => {
      // Configure SAML
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Cookie', adminCookies)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      // Make multiple test requests
      for (let i = 0; i < 3; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/saml/test/initiate')
          .set('Cookie', adminCookies)
          .expect(200);

        expect(response.body.success).toBe(true);
      }

      // Update config directly in database (bypassing service cache)
      await dataSource.query(`
        UPDATE saml_configs 
        SET idp_entity_id = 'https://direct-update.example.com',
            idp_sso_url = 'https://direct-update.example.com/sso'
      `);

      // Test mode should immediately see the change
      const testResponse = await request(app.getHttpServer())
        .get('/auth/saml/test/login')
        .set('Cookie', adminCookies)
        .expect(302);

      // Should redirect to directly updated IdP
      expect(testResponse.headers.location).toContain(
        'https://direct-update.example.com/sso',
      );
    });
  });

  describe('Complete SAML Test Flow', () => {
    it('should complete full test flow without affecting production', async () => {
      // Step 1: Configure SAML (but keep it disabled)
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Cookie', adminCookies)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      // Step 2: Verify SAML is disabled for regular users
      await request(app.getHttpServer()).get('/auth/saml/login').expect(403);

      // Step 3: Admin initiates test
      const initiateResponse = await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(initiateResponse.body.success).toBe(true);
      expect(initiateResponse.body.testLoginUrl).toBeDefined();

      // Step 4: Admin accesses test login URL
      const loginResponse = await request(app.getHttpServer())
        .get('/auth/saml/test/login')
        .set('Cookie', adminCookies)
        .expect(302);

      expect(loginResponse.headers.location).toContain(
        'https://idp.example.com/sso',
      );

      // Step 5: Verify admin session is unchanged
      const configResponse = await request(app.getHttpServer())
        .get('/auth/saml/config')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(configResponse.body).toBeDefined();

      // Step 6: Verify regular SAML login is still disabled
      await request(app.getHttpServer()).get('/auth/saml/login').expect(403);

      // Step 7: Enable SAML for production
      await request(app.getHttpServer())
        .post('/auth/saml/config/enable')
        .set('Cookie', adminCookies)
        .expect(200);

      // Step 8: Verify regular SAML login now works
      const prodLoginResponse = await request(app.getHttpServer())
        .get('/auth/saml/login')
        .expect(302);

      expect(prodLoginResponse.headers.location).toContain(
        'https://idp.example.com/sso',
      );

      // Step 9: Test mode should still work
      const finalTestResponse = await request(app.getHttpServer())
        .get('/auth/saml/test/login')
        .set('Cookie', adminCookies)
        .expect(302);

      expect(finalTestResponse.headers.location).toContain(
        'https://idp.example.com/sso',
      );
    });
  });

  describe('Token Refresh During Test', () => {
    it('should handle expired access token with automatic refresh', async () => {
      // Configure SAML
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Cookie', adminCookies)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', 'accessToken=expired.token.here')
        .expect(401);

      const refreshResponse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', adminCookies)
        .expect(200);
      const newCookies = cookiesOf(refreshResponse).map(
        (cookie) => cookie.split(';')[0],
      );
      expect(cookieValue(newCookies, 'accessToken')).toBeDefined();

      const testResponse = await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', newCookies)
        .expect(200);

      expect(testResponse.body.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing SAML configuration gracefully', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not configured');
    });

    it('should handle incomplete SAML configuration gracefully', async () => {
      // Create incomplete configuration
      await dataSource.query(`
        INSERT INTO saml_configs (
          id, enabled, sp_entity_id, sp_acs_url, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), false, 'dmarc-app',
          'http://localhost:3000/auth/saml/callback', NOW(), NOW()
        )
      `);

      const response = await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('incomplete');
    });

    it('should handle database errors gracefully', async () => {
      // Configure SAML
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Cookie', adminCookies)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      // Delete config to simulate database error during test
      await dataSource.query('DELETE FROM saml_configs');

      const response = await request(app.getHttpServer())
        .post('/auth/saml/test/initiate')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not configured');
    });
  });
});
