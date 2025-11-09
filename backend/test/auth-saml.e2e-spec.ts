import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { SamlService } from '../src/modules/auth/services/saml.service';

describe('SAML Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let samlService: SamlService;
  let adminAccessToken: string;

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
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    samlService = moduleFixture.get<SamlService>(SamlService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await dataSource.query('DELETE FROM saml_configs');
    await dataSource.query('DELETE FROM refresh_tokens');
    await dataSource.query('DELETE FROM users');

    // Create admin user for configuration tests
    const setupDto = {
      email: 'admin@example.com',
      password: 'SecurePass123!',
      passwordConfirmation: 'SecurePass123!',
    };
    const setupResponse = await request(app.getHttpServer())
      .post('/auth/setup')
      .send(setupDto);
    adminAccessToken = setupResponse.body.accessToken;
  });

  describe('GET /auth/saml/metadata', () => {
    it('should return SP metadata XML', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/saml/metadata')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/xml');
      expect(response.text).toContain('EntityDescriptor');
      expect(response.text).toContain('SPSSODescriptor');
      expect(response.text).toContain('AssertionConsumerService');
      expect(response.text).toContain('dmarc-app'); // SP Entity ID from env
    });

    it('should include ACS URL in metadata', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/saml/metadata')
        .expect(200);

      expect(response.text).toContain(
        'http://localhost:3000/auth/saml/callback',
      );
    });

    it('should specify emailAddress NameID format', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/saml/metadata')
        .expect(200);

      expect(response.text).toContain('emailAddress');
    });
  });

  describe('GET /auth/saml/login', () => {
    it('should fail when SAML is not configured', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/saml/login')
        .expect(403);

      expect(response.body.message).toContain('not configured');
    });

    it('should fail when SAML is configured but disabled', async () => {
      // Configure SAML but keep it disabled
      await dataSource.query(`
        INSERT INTO saml_configs (
          id, enabled, idp_entity_id, idp_sso_url, idp_certificate,
          sp_entity_id, sp_acs_url, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), false, 'https://idp.example.com',
          'https://idp.example.com/sso', 'test-cert',
          'dmarc-app', 'http://localhost:3000/auth/saml/callback',
          NOW(), NOW()
        )
      `);

      const response = await request(app.getHttpServer())
        .get('/auth/saml/login')
        .expect(403);

      expect(response.body.message).toContain('not enabled');
    });

    it('should redirect to IdP when SAML is enabled', async () => {
      // Configure and enable SAML
      await dataSource.query(`
        INSERT INTO saml_configs (
          id, enabled, idp_entity_id, idp_sso_url, idp_certificate,
          sp_entity_id, sp_acs_url, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), true, 'https://idp.example.com',
          'https://idp.example.com/sso', 'MIIDXTCCAkWgAwIBAgIJALmVVuDWu4NYMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwHhcNMTYxMjMxMTQzNDQ3WhcNNDgwNjI1MTQzNDQ3WjBFMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzUCFozgNb1h1M0jzNRSCjhOBnR+uVbVpaWfXYIR+AhWDdEe5ryY+CgavOg8bfLybyzFdehlYdDRgkedEB/GjG8aJw06l0qF4jDOAw0kEygWCu2mcH7XOxRt+YAH3TVHa/Hu1W3WjzkobqqqLQ8gkKWWM27fOgAZ6GieaJBN6VBSMMcPey3HWLBmc+TYJmv1dbaO2jHhKh8pfKw0W12VM8P1PIO8gv4Phu/uuJYieBWKixBEyy0lHjyixYFCR12xdh4CA47q958ZRGnnDUGFVE1QhgRacJCOZ9bd5t9mr8KLaVBYTCJo5ERE8jymab5dPqe5qKfJsCZiqWglbjUo9twIDAQABo1AwTjAdBgNVHQ4EFgQUxpuwcs/CYQOyui+r1G+3KxBNhxkwHwYDVR0jBBgwFoAUxpuwcs/CYQOyui+r1G+3KxBNhxkwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAAiWUKs/2x/viNCKi3Y6blEuCtAGhzOOZ9EjrvJ8+COH3Rag3tVBWrcBZ3/uhhPq5gy9lqw4OkvEws99/5jFsX1FJ6MKBgqfuy7yh5s1YfM0ANHYczMmYpZeAcQf2CGAaVfwTTfSlzNLsF2lW/ly7yapFzlYSJLGoVE+OHEu8g09ybs+0tpnaRXiieR4lpQEDXLY2B/FnpcaoBMsLoqKT6+rSlDr5C3jTU11UckOGbfJ1qVtpaqzZWgvMlMIFSqYuQRwdJo+4xdaGEqxNMCKvP7SbCDLCYT0+KPCxnJRnKpruCN0s8Bk0O5vYfqBaJp/VgkqSaXnAhCnXhCYQJHlpKw==',
          'dmarc-app', 'http://localhost:3000/auth/saml/callback',
          NOW(), NOW()
        )
      `);

      const response = await request(app.getHttpServer())
        .get('/auth/saml/login')
        .expect(302);

      // Should redirect to IdP SSO URL
      expect(response.headers.location).toContain(
        'https://idp.example.com/sso',
      );
      expect(response.headers.location).toContain('SAMLRequest');
    });
  });

  describe('POST /auth/saml/callback', () => {
    beforeEach(async () => {
      // Configure and enable SAML for callback tests
      await dataSource.query(`
        INSERT INTO saml_configs (
          id, enabled, idp_entity_id, idp_sso_url, idp_certificate,
          sp_entity_id, sp_acs_url, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), true, 'https://idp.example.com',
          'https://idp.example.com/sso', 'MIIDXTCCAkWgAwIBAgIJALmVVuDWu4NYMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwHhcNMTYxMjMxMTQzNDQ3WhcNNDgwNjI1MTQzNDQ3WjBFMQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzUCFozgNb1h1M0jzNRSCjhOBnR+uVbVpaWfXYIR+AhWDdEe5ryY+CgavOg8bfLybyzFdehlYdDRgkedEB/GjG8aJw06l0qF4jDOAw0kEygWCu2mcH7XOxRt+YAH3TVHa/Hu1W3WjzkobqqqLQ8gkKWWM27fOgAZ6GieaJBN6VBSMMcPey3HWLBmc+TYJmv1dbaO2jHhKh8pfKw0W12VM8P1PIO8gv4Phu/uuJYieBWKixBEyy0lHjyixYFCR12xdh4CA47q958ZRGnnDUGFVE1QhgRacJCOZ9bd5t9mr8KLaVBYTCJo5ERE8jymab5dPqe5qKfJsCZiqWglbjUo9twIDAQABo1AwTjAdBgNVHQ4EFgQUxpuwcs/CYQOyui+r1G+3KxBNhxkwHwYDVR0jBBgwFoAUxpuwcs/CYQOyui+r1G+3KxBNhxkwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAAiWUKs/2x/viNCKi3Y6blEuCtAGhzOOZ9EjrvJ8+COH3Rag3tVBWrcBZ3/uhhPq5gy9lqw4OkvEws99/5jFsX1FJ6MKBgqfuy7yh5s1YfM0ANHYczMmYpZeAcQf2CGAaVfwTTfSlzNLsF2lW/ly7yapFzlYSJLGoVE+OHEu8g09ybs+0tpnaRXiieR4lpQEDXLY2B/FnpcaoBMsLoqKT6+rSlDr5C3jTU11UckOGbfJ1qVtpaqzZWgvMlMIFSqYuQRwdJo+4xdaGEqxNMCKvP7SbCDLCYT0+KPCxnJRnKpruCN0s8Bk0O5vYfqBaJp/VgkqSaXnAhCnXhCYQJHlpKw==',
          'dmarc-app', 'http://localhost:3000/auth/saml/callback',
          NOW(), NOW()
        )
      `);
    });

    it('should reject callback without SAML response', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/callback')
        .expect(401);

      expect(response.body.message).toContain('SAML');
    });

    // Note: Full SAML assertion testing requires generating valid signed SAML responses
    // which is complex and typically done with mock IdP libraries
    // These tests verify the endpoint structure and basic error handling
    // Integration with real IdP would be tested manually or with specialized SAML testing tools

    it('should reject callback with invalid SAML response', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/callback')
        .send({ SAMLResponse: 'invalid-base64-data' })
        .expect(401);

      expect(response.body.message).toContain('SAML');
    });
  });

  describe('SAML Configuration Integration', () => {
    it('should enable SAML and allow login', async () => {
      // Create SAML configuration
      const config = await samlService.createOrUpdateConfig(
        { idpMetadataXml: sampleIdpMetadata },
        'admin-user-id',
      );

      expect(config).toBeDefined();
      expect(config.idpEntityId).toBe('https://idp.example.com');
      expect(config.enabled).toBe(false); // Starts disabled

      // Enable SAML
      await samlService.enableSaml();

      // Verify login endpoint is now accessible
      const response = await request(app.getHttpServer())
        .get('/auth/saml/login')
        .expect(302);

      expect(response.headers.location).toContain(
        'https://idp.example.com/sso',
      );
    });

    it('should disable SAML and block login', async () => {
      // Create and enable SAML configuration
      await samlService.createOrUpdateConfig(
        { idpMetadataXml: sampleIdpMetadata },
        'admin-user-id',
      );
      await samlService.enableSaml();

      // Verify login works
      await request(app.getHttpServer()).get('/auth/saml/login').expect(302);

      // Disable SAML
      await samlService.disableSaml();

      // Verify login is now blocked
      const response = await request(app.getHttpServer())
        .get('/auth/saml/login')
        .expect(403);

      expect(response.body.message).toContain('not enabled');
    });
  });

  describe('GET /auth/saml/config', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/auth/saml/config').expect(401);
    });

    it('should return unconfigured status when no config exists', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        enabled: false,
        configured: false,
        spEntityId: 'dmarc-app',
        spAcsUrl: 'http://localhost:3000/auth/saml/callback',
        hasIdpCertificate: false,
      });
    });

    it('should return configuration status when config exists', async () => {
      // Create SAML configuration
      await samlService.createOrUpdateConfig(
        { idpMetadataXml: sampleIdpMetadata },
        'admin-user-id',
      );

      const response = await request(app.getHttpServer())
        .get('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        enabled: false,
        configured: true,
        spEntityId: 'dmarc-app',
        spAcsUrl: 'http://localhost:3000/auth/saml/callback',
        idpEntityId: 'https://idp.example.com',
        idpSsoUrl: 'https://idp.example.com/sso',
        hasIdpCertificate: true,
      });
    });
  });

  describe('POST /auth/saml/config', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(401);
    });

    it('should create configuration with metadata XML', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      expect(response.body).toMatchObject({
        enabled: false,
        configured: true,
        spEntityId: 'dmarc-app',
        spAcsUrl: 'http://localhost:3000/auth/saml/callback',
        idpEntityId: 'https://idp.example.com',
        idpSsoUrl: 'https://idp.example.com/sso',
        hasIdpCertificate: true,
      });
    });

    it('should create configuration with manual fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          idpEntityId: 'https://manual-idp.example.com',
          idpSsoUrl: 'https://manual-idp.example.com/sso',
          idpCertificate:
            'MIIDXTCCAkWgAwIBAgIJALmVVuDWu4NYMA0GCSqGSIb3DQEBCwUA',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        enabled: false,
        configured: true,
        idpEntityId: 'https://manual-idp.example.com',
        idpSsoUrl: 'https://manual-idp.example.com/sso',
        hasIdpCertificate: true,
      });
    });

    it('should validate metadata XML', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ idpMetadataXml: '<invalid>xml</invalid>' })
        .expect(400);

      expect(response.body.message).toContain('metadata');
    });

    it('should require all manual fields if not using metadata', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          idpEntityId: 'https://manual-idp.example.com',
          // Missing idpSsoUrl and idpCertificate
        })
        .expect(400);

      expect(response.body.message).toContain('manual fields');
    });

    it('should update existing configuration', async () => {
      // Create initial configuration
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      // Update with new manual configuration
      const response = await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          idpEntityId: 'https://updated-idp.example.com',
          idpSsoUrl: 'https://updated-idp.example.com/sso',
          idpCertificate: 'updated-certificate',
        })
        .expect(200);

      expect(response.body.idpEntityId).toBe('https://updated-idp.example.com');
    });
  });

  describe('POST /auth/saml/config/enable', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/auth/saml/config/enable')
        .expect(401);
    });

    it('should fail when no configuration exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/config/enable')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);

      expect(response.body.message).toContain('not found');
    });

    it('should fail when configuration is incomplete', async () => {
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
        .post('/auth/saml/config/enable')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(400);

      expect(response.body.message).toContain('incomplete');
    });

    it('should enable SAML when configuration is complete', async () => {
      // Create complete configuration
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      // Enable SAML
      const response = await request(app.getHttpServer())
        .post('/auth/saml/config/enable')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.message).toContain('enabled');

      // Verify SAML is enabled
      const configResponse = await request(app.getHttpServer())
        .get('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(configResponse.body.enabled).toBe(true);
    });
  });

  describe('POST /auth/saml/config/disable', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/auth/saml/config/disable')
        .expect(401);
    });

    it('should fail when no configuration exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/config/disable')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(404);

      expect(response.body.message).toContain('not found');
    });

    it('should disable SAML', async () => {
      // Create and enable SAML configuration
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/saml/config/enable')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      // Disable SAML
      const response = await request(app.getHttpServer())
        .post('/auth/saml/config/disable')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.message).toContain('disabled');

      // Verify SAML is disabled
      const configResponse = await request(app.getHttpServer())
        .get('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(configResponse.body.enabled).toBe(false);
    });
  });

  describe('POST /auth/saml/config/test', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer())
        .post('/auth/saml/config/test')
        .expect(401);
    });

    it('should fail when SAML is not configured', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/saml/config/test')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not configured');
    });

    it('should fail when SAML configuration is incomplete', async () => {
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
        .post('/auth/saml/config/test')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('incomplete');
    });

    it('should return login URL when configuration is valid', async () => {
      // Create complete configuration
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/auth/saml/config/test')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('valid');
      expect(response.body.loginUrl).toBe(
        'http://localhost:3000/auth/saml/login',
      );
    });

    it('should allow testing even when SAML is disabled', async () => {
      // Create configuration but keep it disabled
      await request(app.getHttpServer())
        .post('/auth/saml/config')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ idpMetadataXml: sampleIdpMetadata })
        .expect(200);

      // Test should still work
      const response = await request(app.getHttpServer())
        .post('/auth/saml/config/test')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.loginUrl).toBeDefined();
    });
  });
});
