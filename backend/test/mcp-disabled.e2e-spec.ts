import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createApp, INITIALIZE, mcpPost, setupAdmin } from './mcp-helpers';

describe('MCP server (e2e, MCP_ENABLED unset)', () => {
  let app: INestApplication<App>;
  let adminCookies: string[];

  beforeAll(async () => {
    app = await createApp(false);
    const dataSource = app.get(DataSource);
    await dataSource.query('DELETE FROM api_tokens');
    await dataSource.query('DELETE FROM refresh_tokens');
    await dataSource.query('DELETE FROM users');
    adminCookies = await setupAdmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('has no MCP endpoint', async () => {
    await mcpPost(app, `dmarc_pat_${'a'.repeat(43)}`)
      .send(INITIALIZE)
      .expect(404);
  });

  it('has no token routes', async () => {
    await request(app.getHttpServer())
      .get('/auth/api-tokens')
      .set('Cookie', adminCookies)
      .expect(404);
    await request(app.getHttpServer())
      .post('/auth/api-tokens')
      .set('Cookie', adminCookies)
      .send({ name: 'x' })
      .expect(404);
  });
});
