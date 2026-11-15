import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { App } from 'supertest/types';

export const ADMIN = { email: 'admin@example.com', password: 'SecurePass123!' };

/**
 * The database config loads entities from dist/**\/*.entity.js, so the app
 * under test is the compiled one (run `npm run build` first). Importing the
 * TypeScript sources would give TypeORM a second, unregistered copy of every
 * entity class.
 */
export function loadBuilt<T>(path: string): T {
  return require(`../dist/src/${path}`) as T;
}

export async function createApp(
  mcpEnabled: boolean,
): Promise<INestApplication<App>> {
  process.env.MCP_ENABLED = mcpEnabled ? 'true' : 'false';
  const { AppModule } =
    loadBuilt<typeof import('../src/app.module')>('app.module');
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export function cookiesOf(response: request.Response): string[] {
  const cookies = response.headers['set-cookie'];
  if (Array.isArray(cookies)) {
    return cookies;
  }
  return typeof cookies === 'string' ? [cookies] : [];
}

export async function setupAdmin(
  app: INestApplication<App>,
): Promise<string[]> {
  await request(app.getHttpServer())
    .post('/auth/setup')
    .send({ ...ADMIN, passwordConfirmation: ADMIN.password })
    .expect(201);
  return login(app, ADMIN.email, ADMIN.password);
}

export async function login(
  app: INestApplication<App>,
  email: string,
  password: string,
): Promise<string[]> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return cookiesOf(response).map((cookie) => cookie.split(';')[0]);
}

export function rpc(method: string, params: Record<string, unknown> = {}) {
  return { jsonrpc: '2.0', id: 1, method, params };
}

export const INITIALIZE = rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'e2e', version: '1.0.0' },
});

export function mcpPost(app: INestApplication<App>, token?: string) {
  const req = request(app.getHttpServer())
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json');
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}
