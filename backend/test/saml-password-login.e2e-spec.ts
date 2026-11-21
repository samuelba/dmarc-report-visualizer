import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ADMIN, createApp, setupAdmin } from './mcp-helpers';

describe('Password login and SAML (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminCookies: string[];

  const post = (path: string) =>
    request(app.getHttpServer()).post(path).set('Cookie', adminCookies);
  const passwordLogin = () =>
    request(app.getHttpServer()).post('/auth/login').send(ADMIN);

  afterEach(async () => {
    await app.close();
  });

  beforeEach(async () => {
    app = await createApp(false);
    dataSource = app.get(DataSource);
    await dataSource.query('DELETE FROM saml_configs');
    await dataSource.query('DELETE FROM refresh_tokens');
    await dataSource.query('DELETE FROM users');
    adminCookies = await setupAdmin(app);

    await post('/auth/saml/config')
      .send({
        idpEntityId: 'https://idp.example.com',
        idpSsoUrl: 'https://idp.example.com/sso',
        idpCertificate: 'MIIDXTCCAkWgAwIBAgIJALmVVuDWu4NYMA0GCSqGSIb3DQEBCwUA',
      })
      .expect(200);
    await dataSource.query(`
      INSERT INTO users (email, password_hash, auth_provider, role)
      VALUES ('saml.admin@example.com', '', 'saml', 'administrator')
    `);
    await post('/auth/saml/config/enable').expect(200);
    await post('/auth/saml/config/disable-password-login').expect(200);
  });

  it('rejects password login while SAML hides it', async () => {
    await passwordLogin().expect(401);
  });

  it('restores password login when SAML is disabled', async () => {
    await post('/auth/saml/config/disable').expect(200);

    const status = await request(app.getHttpServer())
      .get('/auth/saml/status')
      .expect(200);
    expect(status.body.passwordLoginAllowed).toBe(true);
    await passwordLogin().expect(200);
  });
});
