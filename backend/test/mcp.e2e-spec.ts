import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  createApp,
  INITIALIZE,
  loadBuilt,
  login,
  mcpPost,
  rpc,
  setupAdmin,
} from './mcp-helpers';

const { PasswordService } = loadBuilt<
  typeof import('../src/modules/auth/services/password.service')
>('modules/auth/services/password.service');

describe('MCP server (e2e, MCP_ENABLED=true)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminCookies: string[];

  const createToken = async (
    cookies: string[],
    body: Record<string, unknown> = { name: 'e2e' },
  ): Promise<{ token: string; id: string }> => {
    const response = await request(app.getHttpServer())
      .post('/auth/api-tokens')
      .set('Cookie', cookies)
      .send(body)
      .expect(201);
    return { token: response.body.token, id: response.body.apiToken.id };
  };

  beforeAll(async () => {
    app = await createApp(true);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM api_tokens');
    await dataSource.query('DELETE FROM refresh_tokens');
    await dataSource.query('DELETE FROM users');
    adminCookies = await setupAdmin(app);
  });

  describe('authentication', () => {
    it('rejects requests without a token', async () => {
      const response = await mcpPost(app).send(INITIALIZE).expect(401);

      expect(response.headers['www-authenticate']).toBe('Bearer');
    });

    it('does not accept the session cookie', async () => {
      await mcpPost(app)
        .set('Cookie', adminCookies)
        .send(INITIALIZE)
        .expect(401);
    });

    it('rejects an unknown token', async () => {
      await mcpPost(app, `dmarc_pat_${'a'.repeat(43)}`)
        .send(INITIALIZE)
        .expect(401);
    });

    it('rejects a revoked token', async () => {
      const { token, id } = await createToken(adminCookies);
      await request(app.getHttpServer())
        .delete(`/auth/api-tokens/${id}`)
        .set('Cookie', adminCookies)
        .expect(200);

      await mcpPost(app, token).send(INITIALIZE).expect(401);
    });

    it('rejects an expired token', async () => {
      const { token, id } = await createToken(adminCookies);
      await dataSource.query(
        `UPDATE api_tokens SET expires_at = now() - interval '1 minute' WHERE id = $1`,
        [id],
      );

      await mcpPost(app, token).send(INITIALIZE).expect(401);
    });

    it('rejects the token of a deleted user', async () => {
      const { token } = await createToken(adminCookies);
      await dataSource.query('DELETE FROM users');

      await mcpPost(app, token).send(INITIALIZE).expect(401);
    });

    it('does not let a token call the REST API', async () => {
      const { token } = await createToken(adminCookies);

      await request(app.getHttpServer())
        .get('/dmarc-reports/domains')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      await request(app.getHttpServer())
        .get('/auth/api-tokens')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('rejects browser requests from unknown origins', async () => {
      const { token } = await createToken(adminCookies);

      await mcpPost(app, token)
        .set('Origin', 'https://evil.example')
        .send(INITIALIZE)
        .expect(403);
    });
  });

  describe('protocol', () => {
    it('initializes and lists read-only tools', async () => {
      const { token } = await createToken(adminCookies);

      const init = await mcpPost(app, token).send(INITIALIZE).expect(200);
      expect(init.body.result.serverInfo.name).toBe('dmarc-report-visualizer');

      const list = await mcpPost(app, token)
        .send(rpc('tools/list'))
        .expect(200);
      const names = list.body.result.tools.map((t: { name: string }) => t.name);
      expect(names).toContain('search_records');
      expect(names).not.toContain('get_report_xml');
    });

    it('lists the raw XML tool only for tokens with that scope', async () => {
      const { token } = await createToken(adminCookies, {
        name: 'xml',
        allowRawXml: true,
      });

      const list = await mcpPost(app, token)
        .send(rpc('tools/list'))
        .expect(200);
      const names = list.body.result.tools.map((t: { name: string }) => t.name);
      expect(names).toContain('get_report_xml');
    });

    it('runs a tool against the database', async () => {
      const { token } = await createToken(adminCookies);

      const response = await mcpPost(app, token)
        .send(rpc('tools/call', { name: 'list_domains', arguments: {} }))
        .expect(200);

      const body: unknown = JSON.parse(
        (response.body as { result: { content: Array<{ text: string }> } })
          .result.content[0].text,
      );
      expect(body).toEqual({
        managedDomains: [],
        reportDomains: [],
        untrustedFields: ['reportDomains[]'],
      });
    });

    it('answers GET with 405', async () => {
      const { token } = await createToken(adminCookies);

      const response = await request(app.getHttpServer())
        .get('/mcp')
        .set('Authorization', `Bearer ${token}`)
        .expect(405);
      expect(response.headers.allow).toBe('POST');
    });
  });

  describe('token management', () => {
    it('shows the token once and never its hash', async () => {
      const { token } = await createToken(adminCookies);
      expect(token).toMatch(/^dmarc_pat_/);

      const list = await request(app.getHttpServer())
        .get('/auth/api-tokens')
        .set('Cookie', adminCookies)
        .expect(200);
      expect(JSON.stringify(list.body)).not.toContain(token);
      expect(list.body[0]).not.toHaveProperty('tokenHash');
    });

    it('validates the request body', async () => {
      await request(app.getHttpServer())
        .post('/auth/api-tokens')
        .set('Cookie', adminCookies)
        .send({ name: '', expiresInDays: 0 })
        .expect(400);
    });

    it('keeps other users tokens admin-only', async () => {
      const passwordHash = await app
        .get(PasswordService)
        .hashPassword('UserPass12345!');
      await dataSource.query(
        `INSERT INTO users (email, password_hash, role, auth_provider) VALUES ($1, $2, 'user', 'local')`,
        ['user@example.com', passwordHash],
      );
      const userCookies = await login(
        app,
        'user@example.com',
        'UserPass12345!',
      );
      const { id: adminTokenId } = await createToken(adminCookies);

      await request(app.getHttpServer())
        .get('/auth/api-tokens/all')
        .set('Cookie', userCookies)
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/auth/api-tokens/${adminTokenId}`)
        .set('Cookie', userCookies)
        .expect(404);

      const all = await request(app.getHttpServer())
        .get('/auth/api-tokens/all')
        .set('Cookie', adminCookies)
        .expect(200);
      expect(all.body).toHaveLength(1);
    });
  });
});
